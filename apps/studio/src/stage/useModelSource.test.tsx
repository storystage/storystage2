import type { ImportWorker } from '@storystage/backstage-import/worker-client';
import { browserHost, type HostInterface } from '@storystage/host';
import { exampleProduction, type Production, type ProductionFiles } from '@storystage/production';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useModelSource } from './useModelSource.ts';

const host: HostInterface = {
  ...browserHost,
  backstageFolder: '',
  classes: {
    ...browserHost.classes,
    backstage: () => {
      throw new Error('No class open.');
    },
  },
};
const NO_FILES: ProductionFiles = { audio: new Map(), models: new Map() };

/** A film carrying one packed model, and an import worker that counts its checks. */
function filmWithModel() {
  const p = exampleProduction();
  const gran = {
    folder: 'gran',
    item: { displayName: 'Gran' },
  } as unknown as Production['manifest']['models'][number];
  const production: Production = { ...p, manifest: { ...p.manifest, models: [gran] } };
  let checks = 0;
  const startWorker = (): ImportWorker => {
    checks++;
    let answer: ((event: { data: unknown }) => void) | null = null;
    return {
      postMessage: () =>
        queueMicrotask(() =>
          answer?.({
            data: {
              type: 'filmChecked',
              result: {
                checked: [],
                refused: [{ folder: 'gran', name: 'Gran', reason: 'Damaged.' }],
              },
            },
          }),
        ),
      addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
        if (type === 'message') answer = listener;
      },
      terminate: () => undefined,
    } as ImportWorker;
  };
  return { production, startWorker, checks: () => checks };
}

describe('useModelSource', () => {
  it("checks a film's packed models only once a stage asks, and once per film", async () => {
    const f = filmWithModel();
    const { result } = renderHook(() =>
      useModelSource(host, f.production, NO_FILES, { startWorker: f.startWorker }),
    );
    // A lesson that never opens the Screening room never pays for the check.
    expect(f.checks()).toBe(0);
    await result.current.prepare([]);
    await result.current.prepare(['class/Biped/gran']);
    expect(f.checks()).toBe(1);
    await waitFor(() => expect(result.current.refused.map((r) => r.name)).toEqual(['Gran']));
  });

  it('answers from the shipped Backstage first, and finds nothing it has not got', () => {
    const { result } = renderHook(() => useModelSource(host, exampleProduction(), NO_FILES));
    expect(result.current.source.find('nowhere/Prop/thing' as never)).toBeNull();
    expect(result.current.item('nowhere/Prop/thing' as never)).toBeUndefined();
  });
});
