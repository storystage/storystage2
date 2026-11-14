import { BROWSER_POLICY, type HostInterface } from '@storystage/host';
import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import type { ModelSource } from '@storystage/stage/babylon';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY } from '@storystage/story-api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import { ReportProblemCard } from './ReportProblemCard.tsx';

const models = { source: {} as ModelSource, item: () => undefined };
const makeStage: StageMaker = async () => new FakeStage() as Stage;
function startRuntime() {
  const { main, worker } = inMemoryPorts();
  const timers: Timers = { now: () => 0, every: () => () => undefined };
  serve(worker, STORY_LIBRARY, timers);
  return { port: main };
}

const host = (version: string | null, pupils: string[] = []) =>
  ({
    policy: BROWSER_POLICY,
    version,
    classes: {
      pupils: async () => pupils.map((name, i) => ({ id: `p${i}`, name, picture: null })),
    },
  }) as unknown as Pick<HostInterface, 'policy' | 'version' | 'classes'>;

const now = () => new Date('2026-11-14T20:00:00.000Z');

describe('Settings › Report a problem', () => {
  it('makes the report on this device, with the self-test, and shows it in full first', async () => {
    render(
      <ReportProblemCard
        host={host(null, ['Sam'])}
        models={models}
        makeStage={makeStage}
        startRuntime={startRuntime}
        now={now}
      />,
    );
    expect(screen.queryByLabelText('Problem report')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Make the report' }));
    await waitFor(() => expect(screen.queryByLabelText('Problem report')).not.toBeNull(), {
      timeout: 20_000,
    });
    const text = screen.getByLabelText('Problem report').textContent ?? '';
    expect(text).toMatch(/^StoryStage problem report, made 2026-11-14T20:00:00.000Z/);
    expect(text).toContain('StoryStage: the browser version');
    expect(text).toContain('SELFTEST PASS');
    expect(text).toContain('prompter.level: off');
    expect(screen.getByRole('status').textContent).toBe(
      'The report is ready. Read it before you send it.',
    );
    // The browser version can save it as a file, as well as copy it.
    expect(screen.getByRole('button', { name: 'Copy the report' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save the report' })).toBeTruthy();
  }, 30_000);

  it('offers Copy only in the apps, until their picker saves text files', async () => {
    render(
      <ReportProblemCard
        host={host('2.0.0')}
        models={models}
        makeStage={makeStage}
        startRuntime={startRuntime}
        now={now}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Make the report' }));
    await waitFor(() => expect(screen.queryByLabelText('Problem report')).not.toBeNull(), {
      timeout: 20_000,
    });
    expect(screen.getByLabelText('Problem report').textContent).toContain('StoryStage: 2.0.0');
    expect(screen.getByRole('button', { name: 'Copy the report' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save the report' })).toBeNull();
  }, 30_000);
});
