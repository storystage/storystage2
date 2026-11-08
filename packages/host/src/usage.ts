/**
 * Contract: the Prompter's use today on this device (WP24.5, spec 05 section 2.4), for the
 * teacher. The native layer counts each pupil's requests against `prompter.dailyCap`, and the
 * pupil is whoever's folder is open: `countingFor` tells it as folders open and close.
 * Class-wide totals wait for the route chosen in 24.3.
 *
 * Owners: S8, and S5 for the teacher's screen.
 */
import type { ClassFolders, PupilId } from './files.ts';
import { CAP_ACTIONS, PROMPTER_LEVELS, type CapAction, type PrompterLevel } from './policy.ts';
import type { Invoke } from './speech.ts';

export const USAGE_COMMANDS = { usage: 'prompter_usage', pupil: 'prompter_pupil' } as const;

export interface UsageEntry {
  /** The pupil, or `null` for requests made when nobody's folder was open. */
  readonly pupil: PupilId | null;
  /** Requests today that reached the network. */
  readonly used: number;
  /** Their level now: the policy's, until the cap lowers it (the graduated limit). */
  readonly level: PrompterLevel;
}

export interface UsageToday {
  /** The device's local date, `YYYY-MM-DD`. Counts start again each day. */
  readonly date: string;
  /** The policy's level, before any cap. */
  readonly level: PrompterLevel;
  readonly dailyCap: number | null;
  readonly capAction: CapAction;
  /** Only pupils with a request today; anyone else has used nothing. */
  readonly entries: readonly UsageEntry[];
}

export interface PrompterUsage {
  today(): Promise<UsageToday>;
}

const isOneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isEntry(value: unknown): value is UsageEntry {
  return (
    isObject(value) &&
    (value.pupil === null || typeof value.pupil === 'string') &&
    typeof value.used === 'number' &&
    isOneOf(PROMPTER_LEVELS, value.level)
  );
}

function isUsage(value: unknown): value is UsageToday {
  return (
    isObject(value) &&
    typeof value.date === 'string' &&
    isOneOf(PROMPTER_LEVELS, value.level) &&
    (value.dailyCap === null || typeof value.dailyCap === 'number') &&
    isOneOf(CAP_ACTIONS, value.capAction) &&
    Array.isArray(value.entries) &&
    value.entries.every(isEntry)
  );
}

/** The Tauri apps' usage, from the native layer. A reply it can't read is an error. */
export function tauriUsage(invoke: Invoke): PrompterUsage {
  return {
    async today() {
      const reply = await invoke(USAGE_COMMANDS.usage);
      if (!isUsage(reply)) throw new Error('Prompter usage: the native layer gave something else');
      return reply;
    },
  };
}

/**
 * The class folders, telling the native layer whose folder is open as it changes, so the
 * Prompter's requests count against that pupil. `folder(id)`, for Collect and Hand back, doesn't
 * change it. If the native layer can't be told, requests count against the device.
 */
export function countingFor(classes: ClassFolders, invoke: Invoke): ClassFolders {
  const tell = (pupil: PupilId | null) =>
    invoke(USAGE_COMMANDS.pupil, { pupil }).catch(() => undefined);
  return {
    pupils: () => classes.pupils(),
    addPupil: (name, picture) => classes.addPupil(name, picture),
    renamePupil: (id, name, picture) => classes.renamePupil(id, name, picture),
    folder: (id) => classes.folder(id),
    current: () => classes.current(),
    bin: () => classes.bin(),
    restore: (pupil, key) => classes.restore(pupil, key),
    emptyBin: () => classes.emptyBin(),
    binnedPupils: () => classes.binnedPupils(),
    restorePupil: (id) => classes.restorePupil(id),
    backstage: () => classes.backstage(),
    async open(id) {
      const opened = await classes.open(id);
      await tell(opened.pupil.id);
      return opened;
    },
    deviceFilms: () => classes.deviceFilms(),
    moveDeviceFilms: (to) => classes.moveDeviceFilms(to),
    async openDevice() {
      const opened = await classes.openDevice();
      // The device's own folder: requests count against the device, as with none open.
      await tell(null);
      return opened;
    },
    async close() {
      await classes.close();
      await tell(null);
    },
    async removePupil(id) {
      await classes.removePupil(id);
      if (classes.current() === null) await tell(null);
    },
  };
}
