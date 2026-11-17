/**
 * Where the study keeps its data on the device (spec 14, 6.7): a file store of its own, beside
 * the class folders and never in a pupil's folder, so Collect never carries it. It holds a file
 * for each session, the teacher's ticks for who takes part (6.2), and the Study card's class
 * code and age band (6.8). Nothing here sends anything anywhere.
 */
import { FileError, type FileStore, type PupilId } from '@storystage/host';
import { isCode } from './code.ts';
import { AGE_BANDS, isClassCode, isStudyEvent, type AgeBand, type StudyEvent } from './events.ts';

/** One session's file. */
export interface StoredSession {
  readonly format: 'storystage-study-session';
  readonly version: 1;
  readonly code: string;
  readonly events: readonly StudyEvent[];
}

/** A session as the Study card lists it. */
export interface SessionSummary {
  readonly code: string;
  readonly date: string;
  /** Study tasks opened in it. */
  readonly tasks: number;
}

export interface StudySettings {
  readonly classCode: string | null;
  readonly ageBand: AgeBand | null;
}

const SESSIONS = 'sessions';
const TAKING_PART = ['taking-part.json'];
const SETTINGS = ['settings.json'];
const fileOf = (code: string) => [SESSIONS, `${code.toLowerCase()}.json`];

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function decode(bytes: Uint8Array | null): unknown {
  if (bytes === null) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isStoredSession(value: unknown): value is StoredSession {
  return (
    isObject(value) &&
    Object.keys(value).length === 4 &&
    value.format === 'storystage-study-session' &&
    value.version === 1 &&
    isCode(value.code) &&
    Array.isArray(value.events) &&
    value.events.length > 0 &&
    value.events.every(isStudyEvent) &&
    (value.events[0] as StudyEvent).kind === 'session'
  );
}

export class StudyStore {
  private readonly files: FileStore;

  constructor(files: FileStore) {
    this.files = files;
  }

  async writeSession(code: string, events: readonly StudyEvent[]): Promise<void> {
    if (!isCode(code)) throw new FileError('invalid');
    const session: StoredSession = { format: 'storystage-study-session', version: 1, code, events };
    if (!isStoredSession(session)) throw new FileError('invalid');
    await this.files.write(fileOf(code), encode(session));
  }

  /** A session's file, or `null` if there's none or it doesn't read as one. */
  async readSession(code: string): Promise<StoredSession | null> {
    if (!isCode(code)) return null;
    const value = decode(await this.files.read(fileOf(code)));
    return isStoredSession(value) && value.code === code ? value : null;
  }

  /** Every session kept on this device that reads as one, oldest first. */
  async allSessions(): Promise<readonly StoredSession[]> {
    const found: StoredSession[] = [];
    for (const name of await this.files.list([SESSIONS])) {
      const code = name.replace(/\.json$/, '').toUpperCase();
      const session = await this.readSession(code);
      if (session) found.push(session);
    }
    const date = (s: StoredSession) => (s.events[0] as { date: string }).date;
    return found.sort((a, b) => date(a).localeCompare(date(b)) || a.code.localeCompare(b.code));
  }

  async sessions(): Promise<readonly SessionSummary[]> {
    return (await this.allSessions()).map((s) => ({
      code: s.code,
      date: (s.events[0] as { date: string }).date,
      tasks: s.events.filter((e) => e.kind === 'task').length,
    }));
  }

  /** A session is deleted for good: a pupil who withdraws (6.8), or after an export. */
  async deleteSessions(codes: readonly string[]): Promise<void> {
    for (const code of codes) if (isCode(code)) await this.files.remove(fileOf(code));
  }

  /** The pupils the teacher ticked as taking part (6.2). Only ever read on this device. */
  async takingPart(): Promise<ReadonlySet<PupilId>> {
    const value = decode(await this.files.read(TAKING_PART));
    return new Set(
      Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [],
    );
  }

  async setTakingPart(pupil: PupilId, on: boolean): Promise<void> {
    const ids = new Set(await this.takingPart());
    if (on) ids.add(pupil);
    else ids.delete(pupil);
    await this.files.write(TAKING_PART, encode([...ids]));
  }

  async settings(): Promise<StudySettings> {
    const value = decode(await this.files.read(SETTINGS));
    if (!isObject(value)) return { classCode: null, ageBand: null };
    return {
      classCode: isClassCode(value.classCode) ? value.classCode : null,
      ageBand: AGE_BANDS.includes(value.ageBand as AgeBand) ? (value.ageBand as AgeBand) : null,
    };
  }

  async setSettings(settings: StudySettings): Promise<void> {
    if (settings.classCode !== null && !isClassCode(settings.classCode))
      throw new FileError('invalid');
    if (settings.ageBand !== null && !AGE_BANDS.includes(settings.ageBand))
      throw new FileError('invalid');
    await this.files.write(SETTINGS, encode(settings));
  }
}
