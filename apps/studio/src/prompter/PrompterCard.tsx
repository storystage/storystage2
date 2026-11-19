/**
 * Settings › The Prompter (WP13.6; spec 05 section 1): whether this device has a Claude key,
 * **Set up…**, which opens the set-up wizard, and **Remove key**, which switches the Prompter off
 * (the owner's choice, 18 Nov). It shows the key's status, never the key. The browser version
 * has no Prompter, so no card.
 */
import type { KeyStatus, PrompterKey } from '@storystage/prompter';
import { SETUP_FAILED_WORDS } from '@storystage/prompter';
import { Button, NeutralNote, messages } from '@storystage/ui';
import { useEffect, useRef, useState } from 'react';
import { words } from '../strings.ts';

export interface PrompterCardProps {
  keys: PrompterKey;
  /** The school has switched the Prompter off (its level is Off). */
  off: boolean;
  /** Opens the set-up wizard. */
  onSetUp: () => void;
  /** Changes whenever the wizard closes, so the key's status is read again. */
  changed: number;
  /** The key was removed here: the panel reads its status again. */
  onRemoved: () => void;
  onAnnounce?: (text: string) => void;
}

export function PrompterCard({
  keys,
  off,
  onSetUp,
  changed,
  onRemoved,
  onAnnounce,
}: PrompterCardProps) {
  const [status, setStatus] = useState<KeyStatus | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const removing = useRef(false);

  useEffect(() => {
    let live = true;
    keys.status().then(
      (s) => live && setStatus(s),
      () => live && setStatus('failed'),
    );
    return () => {
      live = false;
    };
  }, [keys, changed]);

  const remove = async () => {
    if (removing.current) return;
    removing.current = true;
    setBusy(true);
    try {
      await keys.remove();
      setStatus('absent');
      onRemoved();
      onAnnounce?.(words.t('setup.ready.removed'));
    } catch {
      setStatus('failed');
    } finally {
      removing.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="st-page">
      <section className="st-card" aria-labelledby="st-prompter-title">
        <h2 id="st-prompter-title" className="st-card-title">
          {words.t('setup.card.title')}
        </h2>
        {off && <NeutralNote>{messages.t('note.prompterOffBySchool')}</NeutralNote>}
        <p className="st-note" role="status">
          {status === 'present'
            ? words.t('setup.card.present')
            : status === 'absent'
              ? words.t('setup.card.absent')
              : status === 'failed'
                ? SETUP_FAILED_WORDS
                : ''}
        </p>
        <div className="st-actions">
          {/* Switched off by the school, a key would be refused at Add key: not offered. */}
          <Button onPress={onSetUp} isDisabled={busy || off}>
            {words.t('prompter.setUp')}
          </Button>
          {status === 'present' && (
            <Button variant="quiet" icon="key_off" onPress={() => void remove()} isDisabled={busy}>
              {words.t('setup.ready.remove')}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
