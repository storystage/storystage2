import type { Timeline } from '@storystage/playback';
import { exampleProduction, sceneId, type Production } from '@storystage/production';
import { micros } from '@storystage/story-api';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExportDialog, type ExportChoices, type ExportDialogProps } from './ExportDialog.tsx';

const timeline = (waits = false): Timeline => ({
  scenes: [
    { scene: sceneId('s1'), transition: null, start: 0, length: micros(30), waits: false },
    {
      scene: sceneId('s2'),
      transition: { kind: 'cut', duration: 0 },
      start: micros(30),
      length: micros(30),
      waits,
    },
  ],
  blocks: [],
  lines: [],
  length: micros(60),
  end: { kind: 'ended' },
  missing: [],
});

function setup(over: Partial<ExportDialogProps> = {}) {
  const p = exampleProduction();
  const production: Production = {
    ...p,
    manifest: { ...p.manifest, credits: { names: ['Ana', 'Sam'] } },
  };
  const props: ExportDialogProps = {
    isOpen: true,
    onOpenChange: vi.fn(),
    production,
    timeline: timeline(),
    refusals: [],
    job: { kind: 'idle' },
    onExport: vi.fn<(c: ExportChoices) => void>(),
    onStop: vi.fn(),
    onSaveAgain: vi.fn(),
    ...over,
  };
  render(<ExportDialog {...props} />);
  return props;
}

describe('ExportDialog', () => {
  it('starts with the title card, a byline from the names, captions and 720p, and exports them', async () => {
    const props = setup();
    expect(screen.getByRole('switch', { name: 'Title card' })).toHaveProperty('checked', true);
    expect(screen.getByRole('textbox', { name: 'Under the title' })).toHaveProperty(
      'value',
      'A film by Ana and Sam',
    );
    expect(screen.getByRole('switch', { name: 'Captions on the picture' })).toHaveProperty(
      'checked',
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export film' }));
    expect(props.onExport).toHaveBeenCalledWith({
      titleCard: true,
      byline: 'A film by Ana and Sam',
      captionsOnPicture: true,
      resolution: '720p',
    });
  });

  it('estimates the file size, and more for 1080p', async () => {
    setup();
    // 64 seconds (with the title card) at 720p.
    expect(screen.getByText('The file will be about 23 MB.')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: '1080p' }));
    expect(screen.getByText('The file will be about 49 MB.')).toBeTruthy();
  });

  it('says first which scene waits for a click, and what the film does instead', () => {
    setup({ timeline: timeline(true) });
    expect(screen.getByText(/Scene 2 waits for a click/)).toBeTruthy();
  });

  it('refuses before it starts when a model may not leave the school, with the reasons', () => {
    setup({
      refusals: [
        'Owl may only be used for non-commercial work, so this film can be shown in school but not shared outside it.',
      ],
    });
    expect(screen.getByText(/Owl may only be used/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export film' })).toHaveProperty('disabled', true);
  });

  it('shows the three steps, the bar and the time left, locks the choices, and can stop', async () => {
    const props = setup({
      job: { kind: 'running', step: 'credits', fraction: 0.6, secondsLeft: 90 },
    });
    expect(screen.getByText('Adding captions and credits').getAttribute('aria-current')).toBe(
      'step',
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60');
    expect(screen.getByText('About 2 minutes left')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Title card' })).toHaveProperty('disabled', true);
    await userEvent.click(screen.getByRole('button', { name: 'Stop export' }));
    expect(props.onStop).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Keep working' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says when the film is saved, and that a long film stops at 10 minutes', () => {
    setup({ job: { kind: 'done', name: 'The Lost Penguin', capped: true } });
    expect(screen.getByRole('status').textContent).toBe(
      'The Lost Penguin is saved, with its captions beside it.',
    );
    expect(screen.getByText(/stops there/)).toBeTruthy();
  });

  it('offers to save again when the learner backed out of saving', async () => {
    const props = setup({ job: { kind: 'unsaved', name: 'The Lost Penguin' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save it' }));
    expect(props.onSaveAgain).toHaveBeenCalledOnce();
  });

  it('says what went wrong, and offers to try again', () => {
    setup({ job: { kind: 'failed', words: "This device can't make video files." } });
    expect(screen.getByRole('alert').textContent).toBe("This device can't make video files.");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('waits for the film to be measured before it can export', () => {
    setup({ timeline: null });
    expect(screen.getByRole('button', { name: 'Export film' })).toHaveProperty('disabled', true);
  });
});
