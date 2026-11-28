/** Test helpers for the Sound view: a sound, and code that plays it. */
import { nodeId, type Statement } from '@storystage/ast';
import type { Production, SoundClip } from '@storystage/production';

/** Rain: 10 seconds, of which 2 to 5.5 play. */
export const RAIN: SoundClip = {
  id: 'sn1',
  file: 'sn1.wav',
  label: 'Rain',
  length: 10,
  bytes: 1_572_864,
  trim: { start: 2, end: 5.5 },
  licence: 'not-sure' as const,
  credit: 'A sound, source not checked',
};

/** The example production with the fox playing `sound` at the end of scene 2's script. */
export function playedInScene2(p: Production, sound: string): Production {
  const play = {
    id: nodeId('playsd'),
    kind: 'call',
    target: {
      id: nodeId('playr'),
      kind: 'fieldRef',
      target: { id: nodeId('plays'), kind: 'this' },
      field: nodeId('scene2f'),
    },
    callee: { kind: 'story', name: 'playAudio' },
    args: { audioSource: { id: nodeId('playt'), kind: 'text', value: sound } },
    details: {},
  } as Statement;
  return {
    ...p,
    program: {
      ...p.program,
      types: p.program.types.map((t) =>
        t.name === 'Scene2'
          ? {
              ...t,
              methods: t.methods.map((m, i) => (i === 0 ? { ...m, body: [...m.body, play] } : m)),
            }
          : t,
      ),
    },
  };
}
