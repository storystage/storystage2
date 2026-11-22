import { applyAll } from '@storystage/ast';
import {
  exampleProduction,
  ProductionSession,
  sceneId,
  type Production,
} from '@storystage/production';
import { scriptedTransport, type PrompterEvent } from '@storystage/prompter';
import { testReply } from '@storystage/prompter/testing';
import { modelFields, sceneType } from '@storystage/staging';
import { backstageId, type StoryClass } from '@storystage/story-api';
import { classFor } from '@storystage/story-api/editing';
import { checkProgram } from '@storystage/story-api/program-check';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import type { Studio, StudioSource } from '../studio.ts';
import { usePrompter, type PrompterHost } from './usePrompter.ts';

// An object the Prompter adds is of its character's class, as Backstage's Add makes it (decision
// 0074, workplan 7.14): through the studio's own hook, panel and session, with scripted replies.

const PENGUIN = backstageId('example/Flyer/penguin');
const OWL = backstageId('example/Quadruped/owl');
const ROBOT = backstageId('class/Biped/robot-7');

/** The example with the learner's class for a model, as its first move makes it. */
function taught(p: Production, name: string, storyClass: StoryClass, fields = modelFields(p, OWL)) {
  const made = classFor(p.program, { name, storyClass }, fields)!;
  return { type: made.type, film: { ...p, program: applyAll(p.program, made.edits).program } };
}

/** Asks for `model` in scene 2, builds the plan, and gives the new object's type. */
async function added(film: Production, model: string, known: object | undefined) {
  const step = {
    words: 'A newcomer arrives.',
    kind: 'add',
    actor: 'newcomer',
    action: model,
    target: '',
    details: [],
    line: '',
    sketch: '',
    together: false,
    repeat: 1,
    holds: 0,
    why: 'So there are more.',
  };
  const say = (text: string) => testReply([{ type: 'text', text }]);
  const toolUse = (id: string, name: string, input: unknown) =>
    testReply([{ type: 'tool_use', id, name, input }]);
  const replies: PrompterEvent[][] = [
    toolUse('t1', 'propose_plan', { steps: [step] }),
    say('Here is the plan.'),
    toolUse('t2', 'add_model', {
      backstage_item: model,
      name: 'newcomer',
      position: { x: 1, y: 0, z: 2 },
      narration: 'A newcomer arrives.',
      plan_step: 1,
    }),
    say('Done.'),
  ];
  let next = 0;
  const scripted = scriptedTransport(() => replies[next++] ?? say('No more.'));
  const session = new ProductionSession<StudioSource>(film, { check: (p) => checkProgram(p) });
  const host = {
    version: '1.0.0',
    policy: { prompter: { level: 'full' } },
    prompter: {
      status: async () => ({ available: true }),
      send: (...sent: Parameters<typeof scripted.send>) => scripted.send(...sent),
    },
  } as unknown as PrompterHost;
  const studio = { session, historyChanged: () => {} } as unknown as Studio;
  const models = { item: () => known, catalogue: [] } as unknown as ModelSourceHandle;
  const view = renderHook(() =>
    usePrompter({ host, studio, scene: sceneId('s2'), models, pupil: null }),
  );
  await waitFor(() => expect(view.result.current).not.toBeNull());
  const panel = view.result.current!;
  await act(async () => {
    await panel.refresh();
    panel.setMode('showMeHow');
    await panel.ask('Add one.');
  });
  await act(() => panel.build());
  const now = session.production();
  const field = sceneType(now, sceneId('s2'))!.fields.find((f) => f.name === 'newcomer');
  view.unmount();
  return field?.type;
}

it('makes it of the class the model’s objects are of', async () => {
  const p = exampleProduction();
  const { film, type } = taught(p, 'Waddler', 'Flyer', modelFields(p, PENGUIN));
  expect(await added(film, PENGUIN, { class: 'Flyer', displayName: 'Penguin' })).toEqual({
    kind: 'user',
    type,
  });
});

it('finds the class by Backstage’s name when none of the model’s objects is left', async () => {
  const { film, type } = taught(exampleProduction(), 'Barn owl', 'Quadruped');
  expect(await added(film, OWL, { class: 'Quadruped', displayName: 'Barn owl' })).toEqual({
    kind: 'user',
    type,
  });
});

it('names a packed model this device hasn’t checked from the film', async () => {
  const { film, type } = taught(exampleProduction(), 'Rusty', 'Biped');
  const item = { id: ROBOT, class: 'Biped', displayName: 'Rusty', section: 'cast' };
  const packed = {
    ...film,
    manifest: { ...film.manifest, models: [{ folder: 'robot', item }] },
  } as unknown as Production;
  expect(await added(packed, ROBOT, undefined)).toEqual({ kind: 'user', type });
});

it('leaves one with no class of its Story API class', async () => {
  expect(
    await added(exampleProduction(), OWL, { class: 'Quadruped', displayName: 'Barn owl' }),
  ).toEqual({ kind: 'story', name: 'Quadruped' });
});
