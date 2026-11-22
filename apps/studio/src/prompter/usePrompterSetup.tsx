/**
 * The set-up wizard and the Settings card, with what they share: whether the wizard is open, and
 * reading the Prompter's status again once a key is added or removed. In the browser version
 * (`host.prompterKey` is `null`) there is neither.
 */
import type { HostInterface } from '@storystage/host';
import type { PrompterPanel } from '@storystage/prompter';
import { useCallback, useState, type ReactNode } from 'react';
import type { StudioSource } from '../studio.ts';
import { PrompterCard } from './PrompterCard.tsx';
import { SetupWizard } from './SetupWizard.tsx';

export interface PrompterSetupParts {
  /** Opens the wizard, for **Set up…**; `null` when there is no Prompter. */
  openSetUp: (() => void) | null;
  wizard: ReactNode;
  card: ReactNode;
}

export function usePrompterSetup({
  host,
  panel,
  onAnnounce,
}: {
  host: Pick<HostInterface, 'prompterKey' | 'policy'>;
  panel: PrompterPanel<StudioSource> | null;
  onAnnounce: (text: string) => void;
}): PrompterSetupParts {
  const keys = host.prompterKey;
  const [open, setOpen] = useState(false);
  // Each opening is a new wizard, starting from nothing chosen.
  const [opening, setOpening] = useState(0);
  const [changed, setChanged] = useState(0);
  const refresh = useCallback(() => void panel?.refresh(), [panel]);
  const close = useCallback(() => {
    setOpen(false);
    setChanged((n) => n + 1);
    refresh();
  }, [refresh]);
  const openSetUp = useCallback(() => {
    setOpening((n) => n + 1);
    setOpen(true);
  }, []);
  if (!keys) return { openSetUp: null, wizard: null, card: null };
  return {
    openSetUp,
    wizard: (
      <SetupWizard
        key={opening}
        keys={keys}
        isOpen={open}
        onClose={close}
        onAnnounce={onAnnounce}
      />
    ),
    card: (
      <PrompterCard
        keys={keys}
        off={host.policy.prompter.level === 'off'}
        onSetUp={openSetUp}
        changed={changed}
        onRemoved={refresh}
        onAnnounce={onAnnounce}
      />
    ),
  };
}
