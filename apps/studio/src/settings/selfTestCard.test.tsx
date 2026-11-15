import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import type { ModelSource } from '@storystage/stage/babylon';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY } from '@storystage/story-api';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import { SelfTestCard } from './SelfTestCard.tsx';

const models = { source: {} as ModelSource, item: () => undefined };
const makeStage: StageMaker = async () => new FakeStage() as Stage;

/** A runtime over in-memory ports, as the worker runs it in the app. */
function startRuntime() {
  const { main, worker } = inMemoryPorts();
  const timers: Timers = { now: () => 0, every: () => () => undefined };
  serve(worker, STORY_LIBRARY, timers);
  return { port: main };
}

describe('Settings › Self-test', () => {
  it('runs every step, shows each as it finishes, and ends with SELFTEST PASS', async () => {
    render(<SelfTestCard models={models} makeStage={makeStage} startRuntime={startRuntime} />);
    expect(screen.getByRole('status').textContent).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Run the self-test' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('SELFTEST PASS'), {
      timeout: 20_000,
    });
    const steps = within(screen.getByRole('list', { name: 'Self-test steps' })).getAllByRole(
      'listitem',
    );
    expect(steps).toHaveLength(8);
    for (const step of steps) expect(step.textContent).toMatch(/passed/);
    // The report, to copy into a message, ends with the same line.
    const report = screen.getByLabelText('Self-test report');
    expect(report.textContent?.trim().split('\n').at(-1)).toBe('SELFTEST PASS');
    expect(screen.getByRole('button', { name: 'Run the self-test' }).hasAttribute('disabled')).toBe(
      false,
    );
  }, 30_000);

  it('says SELFTEST FAIL, and which step, when one fails', async () => {
    const broken: StageMaker = async () => {
      const stage = new FakeStage();
      stage.load = () => Promise.reject(new Error('no WebGL'));
      return stage as Stage;
    };
    render(<SelfTestCard models={models} makeStage={broken} startRuntime={startRuntime} />);
    await userEvent.click(screen.getByRole('button', { name: 'Run the self-test' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('SELFTEST FAIL'), {
      timeout: 20_000,
    });
    expect(screen.getByText('Set the stage for each scene').closest('li')?.textContent).toMatch(
      /failed.*no WebGL/,
    );
  }, 30_000);
});
