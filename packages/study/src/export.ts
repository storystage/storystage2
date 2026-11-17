/**
 * Export study logs (spec 14, 6.8; workplan 24.6): one file for the teacher to send to the study
 * team, holding every session kept on this device. The file has no device name or id: its own id
 * is new and random each time. The Study card saves it through the system's picker, and then
 * asks whether to delete the sessions it holds from the device.
 */
import { isCode, newCode, type RandomBytes } from './code.ts';
import { isStudyEvent, type StudyEvent } from './events.ts';
import { localDate } from './session.ts';
import { isStoredSession, type StudyStore } from './store.ts';

export interface StudyExport {
  readonly format: 'storystage-study-log';
  readonly version: 1;
  /** New and random for each export, so the team can tell two files apart. */
  readonly export: string;
  readonly sessions: readonly { readonly code: string; readonly events: readonly StudyEvent[] }[];
}

export interface ExportFile {
  /** `study-logs-2026-11-17-k7p3qx2m.json` */
  readonly name: string;
  readonly bytes: Uint8Array;
  /** The sessions in it, to delete once the file is saved. */
  readonly codes: readonly string[];
}

export async function exportLogs(
  store: StudyStore,
  options: { readonly today?: string; readonly random?: RandomBytes } = {},
): Promise<ExportFile> {
  const id = newCode(options.random);
  const sessions = (await store.allSessions()).map((s) => ({ code: s.code, events: s.events }));
  const file: StudyExport = { format: 'storystage-study-log', version: 1, export: id, sessions };
  return {
    name: `study-logs-${options.today ?? localDate()}-${id.toLowerCase()}.json`,
    bytes: new TextEncoder().encode(`${JSON.stringify(file, null, 1)}\n`),
    codes: sessions.map((s) => s.code),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads an exported file back, refusing anything that isn't exactly one: for the study team, and tests. */
export function readExport(bytes: Uint8Array): StudyExport {
  const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  const ok =
    isObject(value) &&
    Object.keys(value).length === 4 &&
    value.format === 'storystage-study-log' &&
    value.version === 1 &&
    isCode(value.export) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(
      (s) =>
        isObject(s) &&
        Object.keys(s).length === 2 &&
        isStoredSession({ format: 'storystage-study-session', version: 1, ...s }) &&
        (s.events as unknown[]).every(isStudyEvent),
    );
  if (!ok) throw new Error('Not a StoryStage study log.');
  return value as unknown as StudyExport;
}
