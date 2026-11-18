/**
 * The Prompter's set-up wizard (WP13.6; spec 05 section 1; Direction A screens 10a to 10d), drawn
 * on S7's `PrompterSetup` (spec 04 section 4.4), which decides every page and every word for a
 * key's outcome. The key is typed only into the system's own dialog that **Add key** opens: the
 * studio has no key field, and never sees, holds or shows the key (CLAUDE.md rule 1, decision 0056).
 *
 * It opens from **Set up…** in the Prompter panel and in Settings (the owner's choice, 18 Nov).
 */
import {
  PrompterSetup,
  type PrompterKey,
  type SetupPage,
  type SetupState,
} from '@storystage/prompter';
import { AiBadge, Button, Checkbox, Dialog, Icon, RadioCards, type IconName } from '@storystage/ui';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { words, type WordKey } from '../strings.ts';

/** The four steps the wizard numbers, as the mock-up's step row shows them. */
const STEPS = ['who', 'about', 'key', 'ready'] as const satisfies readonly SetupPage[];

export interface SetupWizardProps {
  /** The native layer's key commands (`host.prompterKey`). */
  keys: PrompterKey;
  isOpen: boolean;
  /**
   * The wizard closed: `finished` with a key (the Prompter comes on), `learner` (a learner chose
   * to skip it), or `skipped` (closed part-way, which may follow a key being removed).
   */
  onClose: (how: 'finished' | 'learner' | 'skipped') => void;
  /** Says something in the studio's polite live region. */
  onAnnounce?: (text: string) => void;
}

export function useSetupState(setup: PrompterSetup): SetupState {
  return useSyncExternalStore(
    (l) => setup.subscribe(l),
    () => setup.state,
  );
}

export function SetupWizard({ keys, isOpen, onClose, onAnnounce }: SetupWizardProps) {
  const setup = useMemo(() => new PrompterSetup(keys), [keys]);
  const state = useSetupState(setup);
  const [who, setWho] = useState<'learner' | 'adult' | ''>('');

  // On 10d if a key is stored, otherwise on 10a. Each opening is drawn afresh (its own key).
  useEffect(() => {
    if (isOpen) void setup.open();
  }, [isOpen, setup]);

  const step = STEPS.indexOf(state.page as (typeof STEPS)[number]);
  // What happened, just above the page's buttons: a key's outcome in spec 05's words, or that a
  // command failed.
  const said = (
    <p className="sw-words" role="status">
      {state.busy && state.page === 'key' ? words.t('setup.key.waiting') : (state.words ?? '')}
    </p>
  );
  const skip = (
    <Button variant="quiet" onPress={() => onClose('skipped')} isDisabled={state.busy}>
      {words.t('setup.skip')}
    </Button>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose('skipped')}
      title={words.t('setup.title')}
      icon="headset_mic"
      width={900}
      isDismissable={false}
    >
      <div className="sw">
        {step >= 0 && (
          <>
            <p className="sw-count">{words.t('setup.stepOf', { n: step + 1, of: STEPS.length })}</p>
            <ol className="sw-steps" aria-label={words.t('setup.steps')}>
              {STEPS.map((s, i) => (
                <li
                  key={s}
                  data-done={i < step || undefined}
                  {...(i === step ? { 'aria-current': 'step' as const } : {})}
                >
                  <span className="sw-step-mark" aria-hidden="true">
                    {i < step ? <Icon name="check_circle" filled size={20} /> : i + 1}
                  </span>
                  {words.t(`setup.step.${s}`)}
                </li>
              ))}
            </ol>
          </>
        )}

        {state.page === 'who' && (
          <section className="sw-page" aria-labelledby="sw-who">
            <h3 id="sw-who" className="sw-heading">
              {words.t('setup.who.title')}
            </h3>
            <RadioCards
              label={words.t('setup.who.help')}
              value={who}
              onChange={setWho}
              options={[
                {
                  value: 'learner',
                  label: words.t('setup.who.learner'),
                  description: words.t('setup.who.learnerHelp'),
                },
                {
                  value: 'adult',
                  label: words.t('setup.who.adult'),
                  description: words.t('setup.who.adultHelp'),
                },
              ]}
            />
            {said}
            <div className="sw-actions">
              <span />
              <Button
                variant="primary"
                icon="arrow_forward"
                isDisabled={who === '' || state.busy}
                onPress={() => {
                  if (who === 'adult') return setup.adult();
                  // A learner goes back to the app, with the Prompter off.
                  setup.learner();
                  onClose('learner');
                }}
              >
                {words.t('setup.next')}
              </Button>
            </div>
          </section>
        )}

        {state.page === 'about' && (
          <section className="sw-page" aria-labelledby="sw-about">
            <h3 id="sw-about" className="sw-heading">
              {words.t('setup.about.title')} <AiBadge />
            </h3>
            <p className="sw-help">{words.t('setup.about.readTogether')}</p>
            <ul className="sw-facts">
              {ABOUT.map(([icon, key]) => (
                <li key={key}>
                  <Icon name={icon} size={24} />
                  <span>{words.t(key)}</span>
                </li>
              ))}
            </ul>
            <Checkbox isSelected={state.adultAccount} onChange={(t) => setup.setAdultAccount(t)}>
              {words.t('setup.about.agree')}
            </Checkbox>
            {said}
            <div className="sw-actions">
              <Button variant="quiet" icon="arrow_back" onPress={() => setup.back()}>
                {words.t('setup.back')}
              </Button>
              {skip}
              <Button
                variant="primary"
                icon="arrow_forward"
                isDisabled={!state.adultAccount}
                onPress={() => setup.next()}
              >
                {words.t('setup.about.continue')}
              </Button>
            </div>
          </section>
        )}

        {state.page === 'key' && (
          <section className="sw-page" aria-labelledby="sw-key">
            <h3 id="sw-key" className="sw-heading">
              {words.t('setup.key.title')}
            </h3>
            <p className="sw-help">{words.t('setup.key.adultsOnly')}</p>
            <ol className="sw-console">
              {(['one', 'two', 'three', 'four'] as const).map((n) => (
                <li key={n}>{words.t(`setup.key.step.${n}`)}</li>
              ))}
            </ol>
            <p className="sw-kept">
              <Icon name="lock" size={20} />
              <span>{words.t('setup.key.kept')}</span>
            </p>
            <p className="sw-help">
              <Icon name="help" size={20} /> {words.t('setup.key.noKey')}
            </p>
            {said}
            <div className="sw-actions">
              <Button
                variant="quiet"
                icon="arrow_back"
                isDisabled={state.busy}
                onPress={() => setup.back()}
              >
                {words.t('setup.back')}
              </Button>
              {skip}
              <Button
                variant="primary"
                icon="key"
                isDisabled={state.busy}
                onPress={() =>
                  void setup.addKey().then((outcome) => {
                    if (outcome === 'saved') onAnnounce?.(words.t('setup.key.added'));
                  })
                }
              >
                {words.t(state.busy ? 'setup.key.adding' : 'setup.key.add')}
              </Button>
            </div>
          </section>
        )}

        {state.page === 'ready' && (
          <section className="sw-page" aria-labelledby="sw-ready">
            <h3 id="sw-ready" className="sw-heading">
              {words.t('setup.ready.title')}
            </h3>
            <p className="sw-help">{words.t('setup.ready.help')}</p>
            <dl className="sw-summary">
              {READY.map(([icon, term, value]) => (
                <div key={term}>
                  <Icon name={icon} size={24} />
                  <dt>{words.t(term)}</dt>
                  <dd>{words.t(value)}</dd>
                </div>
              ))}
            </dl>
            {said}
            <div className="sw-actions">
              <Button
                variant="quiet"
                icon="key_off"
                isDisabled={state.busy}
                onPress={() =>
                  void setup.removeKey().then(() => {
                    if (!setup.state.keyStored) onAnnounce?.(words.t('setup.ready.removed'));
                  })
                }
              >
                {words.t('setup.ready.remove')}
              </Button>
              <span />
              <Button
                variant="primary"
                icon="check"
                isDisabled={state.busy}
                onPress={() => {
                  setup.finish();
                  if (setup.state.ended === 'finished') onClose('finished');
                }}
              >
                {words.t('setup.ready.done')}
              </Button>
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}

const ABOUT: readonly (readonly [IconName, WordKey])[] = [
  ['headset_mic', 'setup.about.ai'],
  ['checklist', 'setup.about.plan'],
  ['edit_off', 'setup.about.story'],
  ['cloud_upload', 'setup.about.sent'],
  ['block', 'setup.about.neverSent'],
  ['shield_person', 'setup.about.adultAccount'],
  ['stop_circle', 'setup.about.stop'],
];

const READY: readonly (readonly [IconName, WordKey, WordKey])[] = [
  ['shield_person', 'setup.ready.by', 'setup.ready.byAdult'],
  ['headset_mic', 'setup.ready.prompter', 'setup.ready.prompterOn'],
  ['lock', 'setup.ready.key', 'setup.ready.keyKept'],
];
