/**
 * Contract: the policy in force (spec 05 section 3.8). The native layer works it out from the
 * school's policy file or managed configuration (`apps/desktop/src-tauri/policy`), and the
 * studio only reads it. Nothing in the web code can change the policy.
 *
 * Owners: S8 and S5. A change here is a `contract` pull request reviewed by both, and it changes
 * the Rust twin and the shared fixture in the same pull request.
 */

export const POLICY_SOURCES = ['none', 'file', 'managed', 'unreadable'] as const;
export type PolicySource = (typeof POLICY_SOURCES)[number];

/** The four levels a teacher or school can set (decision 0034). */
export const PROMPTER_LEVELS = ['off', 'explainOnly', 'planOnly', 'full'] as const;
export type PrompterLevel = (typeof PROMPTER_LEVELS)[number];

export const CAP_ACTIONS = ['explainOnly', 'off'] as const;
export type CapAction = (typeof CAP_ACTIONS)[number];

export const CODE_EDITORS = ['blocks', 'tiles'] as const;
export type CodeEditor = (typeof CODE_EDITORS)[number];

export const BACKSTAGE_IMPORTS = ['off', 'teacher', 'learners'] as const;
export type BackstageImport = (typeof BACKSTAGE_IMPORTS)[number];

export const UPDATE_CHANNELS = ['stable', 'pilot', 'off'] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

export interface PolicyInForce {
  readonly source: PolicySource;
  /** False if a policy file wasn't made by an administrator: it can only narrow (3.6). */
  readonly trusted: boolean;
  /** For the IT manager: line numbers and reasons, never the file's contents. */
  readonly diagnostic: string | null;
  /** The keys the school set. Show these controls disabled: "Turned off by your school". */
  readonly set: readonly string[];
  readonly prompter: {
    readonly level: PrompterLevel;
    readonly voiceInput: boolean;
    /** Requests per pupil per day, or null for no limit. */
    readonly dailyCap: number | null;
    readonly capAction: CapAction;
  };
  readonly storyboard: { readonly allowImportedWithoutStoryboard: boolean };
  readonly editor: { readonly default: CodeEditor; readonly locked: boolean };
  readonly study: { readonly enabled: boolean };
  /** Dictation into any text field, with or without the Prompter (decision 0060). */
  readonly speech: { readonly dictation: boolean };
  readonly backstage: { readonly import: BackstageImport; readonly search: boolean };
  readonly update: { readonly channel: UpdateChannel; readonly pin: string | null };
}

/** The browser version's policy: no Prompter, no speech input, no updates (15.6, 0022). */
export const BROWSER_POLICY: PolicyInForce = {
  source: 'none',
  trusted: true,
  diagnostic: null,
  set: [],
  prompter: { level: 'off', voiceInput: false, dailyCap: null, capAction: 'off' },
  storyboard: { allowImportedWithoutStoryboard: false },
  editor: { default: 'blocks', locked: false },
  study: { enabled: false },
  speech: { dictation: false },
  backstage: { import: 'teacher', search: false },
  update: { channel: 'off', pin: null },
};

/** The "When unreadable" column in spec 05 section 3.3: the same as the Rust side. */
export function unreadablePolicy(reason: string): PolicyInForce {
  return {
    ...BROWSER_POLICY,
    source: 'unreadable',
    trusted: false,
    diagnostic: reason,
    backstage: { import: 'off', search: false },
  };
}

const isOneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** True if a reply from the native layer has the shape of `PolicyInForce`. */
export function isPolicyInForce(value: unknown): value is PolicyInForce {
  if (!isObject(value)) return false;
  const {
    source,
    trusted,
    diagnostic,
    set,
    prompter,
    storyboard,
    editor,
    study,
    speech,
    backstage,
    update,
  } = value;
  return (
    isOneOf(POLICY_SOURCES, source) &&
    typeof trusted === 'boolean' &&
    (diagnostic === null || typeof diagnostic === 'string') &&
    Array.isArray(set) &&
    set.every((key) => typeof key === 'string') &&
    isObject(prompter) &&
    isOneOf(PROMPTER_LEVELS, prompter.level) &&
    typeof prompter.voiceInput === 'boolean' &&
    (prompter.dailyCap === null || typeof prompter.dailyCap === 'number') &&
    isOneOf(CAP_ACTIONS, prompter.capAction) &&
    isObject(storyboard) &&
    typeof storyboard.allowImportedWithoutStoryboard === 'boolean' &&
    isObject(editor) &&
    isOneOf(CODE_EDITORS, editor.default) &&
    typeof editor.locked === 'boolean' &&
    isObject(study) &&
    typeof study.enabled === 'boolean' &&
    isObject(speech) &&
    typeof speech.dictation === 'boolean' &&
    isObject(backstage) &&
    isOneOf(BACKSTAGE_IMPORTS, backstage.import) &&
    typeof backstage.search === 'boolean' &&
    isObject(update) &&
    isOneOf(UPDATE_CHANNELS, update.channel) &&
    (update.pin === null || typeof update.pin === 'string')
  );
}

/** The Tauri command that returns the policy in force. It takes no arguments. */
export const POLICY_COMMAND = 'policy_in_force';

/**
 * Reads the policy from the native layer. If the answer can't be used, the policy fails closed
 * here too. `invoke` is Tauri's, passed in so this package has no Tauri in it.
 */
export async function readPolicy(
  invoke: (command: string) => Promise<unknown>,
): Promise<PolicyInForce> {
  try {
    const reply = await invoke(POLICY_COMMAND);
    return isPolicyInForce(reply)
      ? reply
      : unreadablePolicy('The app sent a policy it can’t read.');
  } catch {
    return unreadablePolicy('The app couldn’t read the policy.');
  }
}
