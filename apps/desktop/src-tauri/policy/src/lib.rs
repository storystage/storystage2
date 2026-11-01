//! The school lock (WP15.3, spec 05 section 3).
//!
//! Reads the policy from the file on desktop or from managed configuration on iPad and Android,
//! and works out the policy in force. An unreadable policy fails closed: the Prompter is off.
//! Nothing here turns anything on for a learner. The policy only ever narrows (3.1).

mod file;
#[cfg(windows)]
mod windows;

use std::collections::BTreeMap;

use serde::Serialize;

pub use file::{policy_path, read_installed, read_policy_file};

/// The largest policy file read (3.5). Anything longer is unreadable.
pub const MAX_POLICY_BYTES: usize = 64 * 1024;

/// The highest `prompter.dailyCap` accepted (3.3).
const MAX_DAILY_CAP: u32 = 100_000;

/// Every key the policy knows (3.3). Names are case-sensitive.
pub const KEYS: [&str; 14] = [
    "prompter.enabled",
    "prompter.explainOnly",
    "prompter.planOnly",
    "prompter.voiceInput",
    "prompter.dailyCap",
    "prompter.capAction",
    "storyboard.allowImportedWithoutStoryboard",
    "editor.default",
    "editor.locked",
    "study.enabled",
    "backstage.import",
    "backstage.search",
    "update.channel",
    "update.pin",
];

/// Where the policy in force came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    None,
    File,
    Managed,
    Unreadable,
}

/// The four Prompter levels (decision 0034, spec 05 section 3.4).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PrompterLevel {
    Off,
    ExplainOnly,
    PlanOnly,
    Full,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CapAction {
    ExplainOnly,
    Off,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CodeEditor {
    Blocks,
    Tiles,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BackstageImport {
    Off,
    Teacher,
    Learners,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateChannel {
    Stable,
    Pilot,
    Off,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrompterPolicy {
    pub level: PrompterLevel,
    pub voice_input: bool,
    pub daily_cap: Option<u32>,
    pub cap_action: CapAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardPolicy {
    pub allow_imported_without_storyboard: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorPolicy {
    #[serde(rename = "default")]
    pub default_editor: CodeEditor,
    pub locked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyPolicy {
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackstagePolicy {
    pub import: BackstageImport,
    pub search: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePolicy {
    pub channel: UpdateChannel,
    pub pin: Option<String>,
}

/// What the studio is told (3.8). `PolicyInForce` in `packages/host` is the same shape, and
/// `fixtures/policy-in-force.json` is tested from both sides.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyInForce {
    pub source: Source,
    pub trusted: bool,
    /// For the IT manager. Line numbers and reasons only: the webview shows it, so never the
    /// contents of a line.
    pub diagnostic: Option<String>,
    /// The keys the school set, so the studio can show those controls as locked.
    pub set: Vec<String>,
    pub prompter: PrompterPolicy,
    pub storyboard: StoryboardPolicy,
    pub editor: EditorPolicy,
    pub study: StudyPolicy,
    pub backstage: BackstagePolicy,
    pub update: UpdatePolicy,
}

impl PolicyInForce {
    /// No policy file and no managed configuration: the "With no policy" column in 3.3.
    pub fn no_policy() -> Self {
        Settings::default().in_force(Source::None, true, None, Vec::new())
    }

    /// The "When unreadable" column in 3.3. `reason` must not quote the policy.
    pub fn unreadable(reason: impl Into<String>) -> Self {
        let settings = Settings {
            enabled: false,
            voice_input: false,
            cap_action: CapAction::Off,
            import: BackstageImport::Off,
            channel: UpdateChannel::Off,
            ..Settings::default()
        };
        settings.in_force(Source::Unreadable, false, Some(reason.into()), Vec::new())
    }

    /// The text of a policy file (3.5). `trusted` is the answer from 3.6.
    pub fn from_text(text: &str, trusted: bool) -> Self {
        match entries_from_text(text).and_then(|e| resolve(Source::File, trusted, &e)) {
            Ok(policy) => policy,
            Err(reason) => Self::unreadable(reason),
        }
    }

    /// Managed configuration on iPad and Android (3.5), as strings. Always trusted (3.6).
    pub fn from_managed(pairs: impl IntoIterator<Item = (String, String)>) -> Self {
        let entries: Vec<Entry> = pairs
            .into_iter()
            .map(|(key, value)| Entry { line: None, key, value })
            .collect();
        match resolve(Source::Managed, true, &entries) {
            Ok(policy) if entries.is_empty() => Self { source: Source::None, ..policy },
            Ok(policy) => policy,
            Err(reason) => Self::unreadable(reason),
        }
    }
}

/// One `key=value`. `line` is `None` for managed configuration, which has no lines.
struct Entry {
    line: Option<usize>,
    key: String,
    value: String,
}

fn place(line: Option<usize>) -> String {
    match line {
        Some(number) => format!("Line {number}"),
        None => "A managed setting".to_string(),
    }
}

fn entries_from_text(text: &str) -> Result<Vec<Entry>, String> {
    let mut entries = Vec::new();
    for (index, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
            continue;
        }
        let number = Some(index + 1);
        let Some((key, value)) = line.split_once('=') else {
            return Err(format!("{}: there is no equals sign.", place(number)));
        };
        entries.push(Entry {
            line: number,
            key: key.trim().to_string(),
            value: value.trim().to_string(),
        });
    }
    Ok(entries)
}

/// Applies the entries over the defaults, or says why they can't be used. Every value is
/// checked before trust is considered, so a broken file is unreadable whoever made it (3.6).
fn resolve(source: Source, trusted: bool, entries: &[Entry]) -> Result<PolicyInForce, String> {
    let mut settings = Settings::default();
    let mut seen: BTreeMap<&str, &str> = BTreeMap::new();
    let mut set = Vec::new();
    let mut notes = Vec::new();
    let mut narrowed = false;

    for entry in entries {
        let (key, value) = (entry.key.as_str(), entry.value.as_str());
        if !KEYS.contains(&key) {
            if key.to_ascii_lowercase().starts_with("prompter.") {
                return Err(format!(
                    "{}: this Prompter setting isn't one StoryStage knows.",
                    place(entry.line)
                ));
            }
            notes.push(format!("{}: unknown setting, ignored.", place(entry.line)));
            continue;
        }
        if settings.apply(key, value).is_none() {
            return Err(format!("{}: this value isn't allowed.", place(entry.line)));
        }
        if let Some(previous) = seen.insert(key, value) {
            if previous != value {
                return Err(format!(
                    "{}: this setting is given twice with different values.",
                    place(entry.line)
                ));
            }
            continue;
        }
        if !trusted && widens(key, value) {
            narrowed = true;
        } else {
            set.push(key.to_string());
        }
    }

    if !trusted {
        settings = settings.narrowed();
    }
    if narrowed {
        notes.push(
            "An administrator didn't create this file, so settings that allow more are ignored. \
             Run takeown /a on the file and its folder."
                .to_string(),
        );
    }
    let diagnostic = (!notes.is_empty()).then(|| notes.join(" "));
    Ok(settings.in_force(source, trusted, diagnostic, set))
}

/// The "Widens?" column in 3.3.
fn widens(key: &str, value: &str) -> bool {
    match key {
        "storyboard.allowImportedWithoutStoryboard" | "study.enabled" | "backstage.search" => {
            value == "true"
        }
        "backstage.import" => value == "learners",
        "editor.default" | "update.channel" | "update.pin" => true,
        _ => false,
    }
}

fn parse_bool(value: &str) -> Option<bool> {
    match value {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

fn parse_cap(value: &str) -> Option<u32> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    value.parse().ok().filter(|cap| *cap <= MAX_DAILY_CAP)
}

/// Three whole numbers, such as `1.4.2`: the versions the release workflow makes.
pub fn is_version(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    parts.len() == 3
        && parts.iter().all(|part| {
            !part.is_empty()
                && part.bytes().all(|b| b.is_ascii_digit())
                && part.parse::<u64>().is_ok()
        })
}

/// What the policy says, before the Prompter's level is worked out.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Settings {
    enabled: bool,
    explain_only: bool,
    plan_only: bool,
    voice_input: bool,
    daily_cap: Option<u32>,
    cap_action: CapAction,
    allow_imported: bool,
    default_editor: CodeEditor,
    editor_locked: bool,
    study: bool,
    import: BackstageImport,
    search: bool,
    channel: UpdateChannel,
    pin: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: true,
            explain_only: false,
            plan_only: false,
            voice_input: true,
            daily_cap: None,
            cap_action: CapAction::ExplainOnly,
            allow_imported: false,
            default_editor: CodeEditor::Blocks,
            editor_locked: false,
            study: false,
            import: BackstageImport::Teacher,
            search: false,
            channel: UpdateChannel::Stable,
            pin: None,
        }
    }
}

impl Settings {
    /// Sets one key. `None` if the key or its value isn't allowed.
    fn apply(&mut self, key: &str, value: &str) -> Option<()> {
        match key {
            "prompter.enabled" => self.enabled = parse_bool(value)?,
            "prompter.explainOnly" => self.explain_only = parse_bool(value)?,
            "prompter.planOnly" => self.plan_only = parse_bool(value)?,
            "prompter.voiceInput" => self.voice_input = parse_bool(value)?,
            "prompter.dailyCap" => self.daily_cap = Some(parse_cap(value)?),
            "prompter.capAction" => {
                self.cap_action = match value {
                    "explainOnly" => CapAction::ExplainOnly,
                    "off" => CapAction::Off,
                    _ => return None,
                }
            }
            "storyboard.allowImportedWithoutStoryboard" => {
                self.allow_imported = parse_bool(value)?
            }
            "editor.default" => {
                self.default_editor = match value {
                    "blocks" => CodeEditor::Blocks,
                    "tiles" => CodeEditor::Tiles,
                    _ => return None,
                }
            }
            "editor.locked" => self.editor_locked = parse_bool(value)?,
            "study.enabled" => self.study = parse_bool(value)?,
            "backstage.import" => {
                self.import = match value {
                    "off" => BackstageImport::Off,
                    "teacher" => BackstageImport::Teacher,
                    "learners" => BackstageImport::Learners,
                    _ => return None,
                }
            }
            "backstage.search" => self.search = parse_bool(value)?,
            "update.channel" => {
                self.channel = match value {
                    "stable" => UpdateChannel::Stable,
                    "pilot" => UpdateChannel::Pilot,
                    "off" => UpdateChannel::Off,
                    _ => return None,
                }
            }
            "update.pin" if value.is_empty() => self.pin = None,
            "update.pin" if is_version(value) => self.pin = Some(value.to_string()),
            _ => return None,
        }
        Some(())
    }

    /// Takes back whatever a file nobody trusts asked for (3.6). The rest still applies.
    fn narrowed(self) -> Self {
        let defaults = Self::default();
        Self {
            allow_imported: defaults.allow_imported,
            default_editor: defaults.default_editor,
            study: defaults.study,
            import: match self.import {
                BackstageImport::Learners => defaults.import,
                import => import,
            },
            search: defaults.search,
            channel: defaults.channel,
            pin: defaults.pin,
            ..self
        }
    }

    /// The four levels (3.4). The more restrictive wins.
    fn level(&self) -> PrompterLevel {
        if !self.enabled {
            PrompterLevel::Off
        } else if self.explain_only {
            PrompterLevel::ExplainOnly
        } else if self.plan_only {
            PrompterLevel::PlanOnly
        } else {
            PrompterLevel::Full
        }
    }

    fn in_force(
        self,
        source: Source,
        trusted: bool,
        diagnostic: Option<String>,
        set: Vec<String>,
    ) -> PolicyInForce {
        PolicyInForce {
            source,
            trusted,
            diagnostic,
            set,
            prompter: PrompterPolicy {
                level: self.level(),
                voice_input: self.voice_input,
                daily_cap: self.daily_cap,
                cap_action: self.cap_action,
            },
            storyboard: StoryboardPolicy { allow_imported_without_storyboard: self.allow_imported },
            editor: EditorPolicy { default_editor: self.default_editor, locked: self.editor_locked },
            study: StudyPolicy { enabled: self.study },
            backstage: BackstagePolicy { import: self.import, search: self.search },
            update: UpdatePolicy { channel: self.channel, pin: self.pin },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(policy: &str) -> PolicyInForce {
        PolicyInForce::from_text(policy, true)
    }

    /// Everything but the reason, which differs by cause.
    fn without_reason(policy: PolicyInForce) -> PolicyInForce {
        PolicyInForce { diagnostic: None, ..policy }
    }

    #[test]
    fn with_no_policy_the_defaults_apply() {
        let policy = PolicyInForce::no_policy();
        assert_eq!(policy.source, Source::None);
        assert!(policy.trusted);
        assert!(policy.set.is_empty());
        assert_eq!(policy.prompter.level, PrompterLevel::Full);
        assert!(policy.prompter.voice_input);
        assert_eq!(policy.prompter.daily_cap, None);
        assert_eq!(policy.prompter.cap_action, CapAction::ExplainOnly);
        assert!(!policy.storyboard.allow_imported_without_storyboard);
        assert_eq!(policy.editor.default_editor, CodeEditor::Blocks);
        assert!(!policy.editor.locked);
        assert!(!policy.study.enabled);
        assert_eq!(policy.backstage.import, BackstageImport::Teacher);
        assert!(!policy.backstage.search);
        assert_eq!(policy.update.channel, UpdateChannel::Stable);
        assert_eq!(policy.update.pin, None);
    }

    #[test]
    fn an_empty_file_is_a_policy_that_sets_nothing() {
        let policy = text("# nothing yet\n\n! nor here\n");
        assert_eq!(policy.source, Source::File);
        assert!(policy.set.is_empty());
        assert_eq!(policy.prompter.level, PrompterLevel::Full);
    }

    #[test]
    fn each_key_takes_effect() {
        let policy = text(
            "prompter.voiceInput=false\n\
             prompter.dailyCap=20\n\
             prompter.capAction=off\n\
             storyboard.allowImportedWithoutStoryboard=true\n\
             editor.default=tiles\n\
             editor.locked=true\n\
             study.enabled=true\n\
             backstage.import=learners\n\
             backstage.search=true\n\
             update.channel=pilot\n\
             update.pin=1.4.2\n",
        );
        assert_eq!(policy.source, Source::File);
        assert_eq!(policy.diagnostic, None);
        assert!(!policy.prompter.voice_input);
        assert_eq!(policy.prompter.daily_cap, Some(20));
        assert_eq!(policy.prompter.cap_action, CapAction::Off);
        assert!(policy.storyboard.allow_imported_without_storyboard);
        assert_eq!(policy.editor.default_editor, CodeEditor::Tiles);
        assert!(policy.editor.locked);
        assert!(policy.study.enabled);
        assert_eq!(policy.backstage.import, BackstageImport::Learners);
        assert!(policy.backstage.search);
        assert_eq!(policy.update.channel, UpdateChannel::Pilot);
        assert_eq!(policy.update.pin.as_deref(), Some("1.4.2"));
        assert_eq!(policy.set.len(), 11);
    }

    #[test]
    fn every_listed_key_is_handled() {
        for key in KEYS {
            let handled = ["true", "off", "blocks", "1", "1.0.0"]
                .iter()
                .any(|value| Settings::default().apply(key, value).is_some());
            assert!(handled, "{key}");
        }
    }

    #[test]
    fn the_four_levels_and_the_more_restrictive_wins() {
        use PrompterLevel::*;
        let table = [
            (false, false, false, Off),
            (false, false, true, Off),
            (false, true, false, Off),
            (false, true, true, Off),
            (true, false, false, Full),
            (true, false, true, PlanOnly),
            (true, true, false, ExplainOnly),
            (true, true, true, ExplainOnly),
        ];
        for (enabled, explain_only, plan_only, level) in table {
            let policy = text(&format!(
                "prompter.enabled={enabled}\n\
                 prompter.explainOnly={explain_only}\n\
                 prompter.planOnly={plan_only}\n"
            ));
            assert_eq!(policy.prompter.level, level, "{enabled} {explain_only} {plan_only}");
        }
    }

    #[test]
    fn prompter_enabled_true_does_not_lift_explain_only() {
        let policy = text("prompter.explainOnly=true\nprompter.enabled=true\n");
        assert_eq!(policy.prompter.level, PrompterLevel::ExplainOnly);
    }

    #[test]
    fn spaces_comments_and_blank_lines_are_ignored() {
        let policy = text("  # a note\n\n ! another\n  prompter.enabled  =  false  \r\n");
        assert_eq!(policy.prompter.level, PrompterLevel::Off);
        assert_eq!(policy.set, vec!["prompter.enabled"]);
    }

    #[test]
    fn every_way_of_being_malformed_fails_the_same_way() {
        let closed = without_reason(PolicyInForce::unreadable(""));
        assert_eq!(closed.source, Source::Unreadable);
        assert!(!closed.trusted);
        assert_eq!(closed.prompter.level, PrompterLevel::Off);
        assert!(!closed.prompter.voice_input);
        assert_eq!(closed.backstage.import, BackstageImport::Off);
        assert!(!closed.backstage.search);
        assert!(!closed.study.enabled);
        assert_eq!(closed.update.channel, UpdateChannel::Off);
        assert_eq!(closed.update.pin, None);

        let broken = [
            "prompter.enabled",
            "this is not a setting",
            "prompter.enabled=no",
            "prompter.enabled=TRUE",
            "prompter.enabled=",
            "prompter.dailyCap=lots",
            "prompter.dailyCap=-1",
            "prompter.dailyCap=+5",
            "prompter.dailyCap=100001",
            "prompter.dailyCap=99999999999999999999",
            "prompter.capAction=stop",
            "editor.default=scratch",
            "backstage.import=everyone",
            "update.channel=beta",
            "update.pin=latest",
            "update.pin=1.4",
            "update.pin=v1.4.2",
            "update.pin=1.4.2-beta",
            "update.pin=1..2",
            "prompter.enabled=true\nprompter.enabled=false",
            "prompter.enable=false",
            "Prompter.Enabled=false",
            "PROMPTER.NEWTHING=1",
        ];
        for case in broken {
            let policy = text(case);
            assert!(policy.diagnostic.is_some(), "{case}");
            assert_eq!(without_reason(policy), closed, "{case}");
        }
    }

    #[test]
    fn the_same_key_twice_with_the_same_value_is_fine() {
        let policy = text("editor.locked=true\neditor.locked=true\n");
        assert_eq!(policy.source, Source::File);
        assert_eq!(policy.set, vec!["editor.locked"]);
    }

    #[test]
    fn other_unknown_keys_are_ignored_and_noted() {
        let policy = text("editor.locked=true\nsomething.new=7\n");
        assert_eq!(policy.source, Source::File);
        assert!(policy.editor.locked);
        assert_eq!(policy.set, vec!["editor.locked"]);
        assert_eq!(policy.diagnostic.as_deref(), Some("Line 2: unknown setting, ignored."));
    }

    #[test]
    fn a_diagnostic_never_quotes_the_file() {
        for case in ["secret-words", "prompter.enabled=secret-words", "secret-words=1"] {
            let diagnostic = text(case).diagnostic.unwrap_or_default();
            assert!(!diagnostic.is_empty(), "{case}");
            assert!(!diagnostic.contains("secret"), "{diagnostic}");
        }
    }

    #[test]
    fn a_file_nobody_trusts_cannot_widen() {
        let policy = PolicyInForce::from_text(
            "storyboard.allowImportedWithoutStoryboard=true\n\
             editor.default=tiles\n\
             study.enabled=true\n\
             backstage.import=learners\n\
             backstage.search=true\n\
             update.channel=pilot\n\
             update.pin=1.4.2\n",
            false,
        );
        let defaults = PolicyInForce::no_policy();
        assert_eq!(policy.source, Source::File);
        assert!(!policy.trusted);
        assert!(policy.set.is_empty());
        assert_eq!(policy.storyboard, defaults.storyboard);
        assert_eq!(policy.editor, defaults.editor);
        assert_eq!(policy.study, defaults.study);
        assert_eq!(policy.backstage, defaults.backstage);
        assert_eq!(policy.update, defaults.update);
        assert!(policy.diagnostic.unwrap_or_default().contains("takeown"));
    }

    #[test]
    fn a_file_nobody_trusts_can_still_narrow() {
        let policy = PolicyInForce::from_text(
            "prompter.explainOnly=true\n\
             prompter.voiceInput=false\n\
             prompter.dailyCap=5\n\
             prompter.capAction=off\n\
             editor.locked=true\n\
             backstage.import=off\n\
             study.enabled=false\n",
            false,
        );
        assert_eq!(policy.prompter.level, PrompterLevel::ExplainOnly);
        assert!(!policy.prompter.voice_input);
        assert_eq!(policy.prompter.daily_cap, Some(5));
        assert_eq!(policy.prompter.cap_action, CapAction::Off);
        assert!(policy.editor.locked);
        assert_eq!(policy.backstage.import, BackstageImport::Off);
        assert_eq!(policy.set.len(), 7);
        assert_eq!(policy.diagnostic, None);
    }

    #[test]
    fn a_broken_file_nobody_trusts_is_still_unreadable() {
        let policy = PolicyInForce::from_text("study.enabled=maybe\n", false);
        assert_eq!(policy.source, Source::Unreadable);
        assert_eq!(policy.prompter.level, PrompterLevel::Off);
    }

    #[test]
    fn managed_configuration_goes_through_the_same_checks() {
        let pairs = |key: &str, value: &str| [(key.to_string(), value.to_string())];

        let policy = PolicyInForce::from_managed(pairs("prompter.planOnly", "true"));
        assert_eq!(policy.source, Source::Managed);
        assert!(policy.trusted);
        assert_eq!(policy.prompter.level, PrompterLevel::PlanOnly);
        assert_eq!(policy.set, vec!["prompter.planOnly"]);

        let policy = PolicyInForce::from_managed(pairs("prompter.enabled", "5"));
        assert_eq!(policy.source, Source::Unreadable);
        assert_eq!(policy.diagnostic.as_deref(), Some("A managed setting: this value isn't allowed."));

        let policy = PolicyInForce::from_managed(pairs("prompter.enable", "false"));
        assert_eq!(policy.source, Source::Unreadable);
    }

    #[test]
    fn no_managed_configuration_is_no_policy() {
        assert_eq!(PolicyInForce::from_managed([]), PolicyInForce::no_policy());
    }

    /// The other half of this test is in `packages/host`, against the same file.
    #[test]
    fn the_shared_fixture_matches() {
        let policy = text(
            "prompter.planOnly=true\n\
             prompter.dailyCap=20\n\
             editor.locked=true\n",
        );
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../fixtures/policy-in-force.json")).unwrap();
        assert_eq!(serde_json::to_value(policy).unwrap(), fixture);
    }
}
