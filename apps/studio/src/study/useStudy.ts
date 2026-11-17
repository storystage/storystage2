/**
 * The study session in the studio (spec 14 sections 6.2, 6.3 and 6.6; WP7.13): who takes part,
 * when a session starts and ends, and what the studio tells it. S6's `StudySession` keeps the log;
 * this decides when there is one, and counts what happens.
 *
 * - **Who:** with a class list, a pupil the teacher ticked (6.2); with none, the adult's answer to
 *   "Is this learner taking part in the study?", asked when a film opens, until the app closes.
 * - **When:** from the folder opening (or the answer Yes) to the folder closing.
 * - **What:** each step the history closes (an edit), each undo and redo, the learner's switch
 *   of editor, and Learn opened. The session keeps only what its phase allows (6.6).
 */
import type { HostInterface, PupilFolder } from '@storystage/host';
import { StudySession, StudyStore, localDate } from '@storystage/study';
import { useCallback, useEffect, useRef, useState } from 'react';
import { editorSetting, editorShown } from '../production/editorSetting.ts';
import type { Studio } from '../studio.ts';
import { studyOn } from './StudyCard.tsx';

export interface StudyOptions {
  readonly host: Pick<HostInterface, 'policy' | 'version' | 'classes'>;
  /** The pupil's folder open now, or `null`. */
  readonly folder: PupilFolder | null;
  /** Whether the device has a class list: then the teacher's ticks say who takes part. */
  readonly hasClass: boolean;
  /** Whether a film is open in the studio, when a device with no class list asks. */
  readonly inStudio: boolean;
  readonly studio: Studio;
}

export interface Study {
  /** The session going on, or `null`: no study, or this learner isn't taking part. */
  readonly session: StudySession | null;
  /** The question for a device with no class list is showing. */
  readonly asking: boolean;
  /** The adult's answer. It lasts until the app closes. */
  answer(yes: boolean): void;
  /** Learn was opened: help, if a task is open (6.6). */
  learnOpened(): void;
}

/** The adult's answer on a device with no class list, until the app closes (6.2). */
let deviceAnswer: boolean | null = null;

/** For tests: forgets the answer, as closing the app does. */
export function forgetDeviceAnswer() {
  deviceAnswer = null;
}

export function useStudy({ host, folder, hasClass, inStudio, studio }: StudyOptions): Study {
  const on = studyOn(host.policy);
  const [session, setSession] = useState<StudySession | null>(null);
  const [answered, setAnswered] = useState<boolean | null>(deviceAnswer);
  const pupil = folder?.pupil.id ?? null;
  const asking = on && folder !== null && !hasClass && inStudio && answered === null;

  // A session for this folder, if its learner takes part; closed when the folder closes.
  useEffect(() => {
    if (!on || pupil === null) return;
    if (!hasClass && answered !== true) return;
    let live = true;
    let made: StudySession | null = null;
    const store = new StudyStore(host.classes.study());
    void (async () => {
      if (hasClass && !(await store.takingPart([pupil])).has(pupil)) return;
      const settings = await store.settings();
      if (!live) return;
      const { policy } = host;
      made = new StudySession({
        store,
        context: {
          date: localDate(),
          version: host.version ?? '0.0.0',
          classCode: settings.classCode,
          ageBand: settings.ageBand,
          editorDefault: policy.editor.default,
          editorLocked: policy.editor.locked,
          editor: editorShown(editorSetting.get(), policy.editor),
        },
        onError: (error) => console.error('The study log could not be written.', error),
      });
      setSession(made);
    })().catch((error: unknown) => console.error('The study session could not start.', error));
    return () => {
      live = false;
      made?.close();
      setSession(null);
    };
  }, [on, host, pupil, hasClass, answered]);

  // Each step the history closes, each undo and redo (6.6).
  const history = studio.session;
  useEffect(() => {
    if (!session) return;
    const done = () => history.history().filter((h) => h.done).length;
    let steps = done();
    return history.subscribe((change) => {
      const now = done();
      if (change.source === 'undo') session.undone();
      else if (change.source === 'redo') session.redone();
      else if (change.source !== 'load' && change.source !== 'check')
        // A run of typing is one step: it's counted once it's closed, at the next change.
        for (let n = steps; n < now; n++) session.edited();
      steps = now;
    });
  }, [session, history]);

  // The learner's switch of editor, in a task or not (6.6).
  const policy = host.policy.editor;
  useEffect(() => {
    if (!session) return;
    let shown = editorShown(editorSetting.get(), policy);
    return editorSetting.subscribe(() => {
      const next = editorShown(editorSetting.get(), policy);
      if (next !== shown) session.switched(shown, next);
      shown = next;
    });
  }, [session, policy]);

  const current = useRef(session);
  useEffect(() => {
    current.current = session;
  });
  const learnOpened = useCallback(() => current.current?.help('learn'), []);
  const answer = useCallback((yes: boolean) => {
    deviceAnswer = yes;
    setAnswered(yes);
  }, []);

  return { session, asking, answer, learnOpened };
}
