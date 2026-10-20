/**
 * Spike 1.4: a tiny program format, just enough to test the scheduler. Throwaway: the real
 * program format is S2's (WP2, `packages/ast`).
 */

export type Statement =
  | { kind: 'doInOrder'; body: Statement[] }
  | { kind: 'doTogether'; body: Statement[] }
  | { kind: 'count'; times: number; body: Statement[] }
  | {
      kind: 'move';
      target: string;
      direction: 'forward' | 'backward' | 'up' | 'down';
      amount: number;
      duration: number;
    }
  | { kind: 'turn'; target: string; direction: 'left' | 'right'; amount: number; duration: number }
  | { kind: 'say'; target: string; text: string; duration: number };

export interface TimedEvent {
  /** Seconds between runs. */
  every: number;
  body: Statement[];
}

export interface Program {
  objects: { name: string; x: number; z: number; heading: number }[];
  main: Statement[];
  events: TimedEvent[];
}

/** The program the spike runs: do in order, nested do together, count and a timed event. */
export const SAMPLE: Program = {
  objects: [
    { name: 'cat', x: -1, z: 0, heading: 0 },
    { name: 'dog', x: 1, z: 0, heading: 0 },
  ],
  main: [
    { kind: 'say', target: 'cat', text: 'Hello', duration: 1 },
    {
      kind: 'doTogether',
      body: [
        { kind: 'move', target: 'cat', direction: 'forward', amount: 2, duration: 1 },
        {
          kind: 'doInOrder',
          body: [
            { kind: 'turn', target: 'dog', direction: 'left', amount: 0.25, duration: 0.5 },
            {
              kind: 'doTogether',
              body: [
                { kind: 'move', target: 'dog', direction: 'forward', amount: 1, duration: 0.75 },
                { kind: 'move', target: 'dog', direction: 'up', amount: 0.5, duration: 0.25 },
              ],
            },
          ],
        },
      ],
    },
    {
      kind: 'count',
      times: 3,
      body: [{ kind: 'turn', target: 'cat', direction: 'right', amount: 0.5, duration: 0.25 }],
    },
  ],
  events: [
    {
      every: 0.5,
      body: [{ kind: 'move', target: 'dog', direction: 'up', amount: 0.1, duration: 0.1 }],
    },
  ],
};
