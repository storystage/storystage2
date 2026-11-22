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

  it('says how many speak lines are silent, with their captions', () => {
    setup({
      job: {
        kind: 'done',
        name: 'Kite',
        capped: false,
        sound: { voiced: 3, silent: 2, unencoded: false },
      },
    });
    expect(
      screen.getByText(/2 speak lines are silent, because their voices weren’t ready/),
    ).toBeTruthy();
  });

  it('says when this device can’t put sound into a film', () => {
    setup({
      job: {
        kind: 'done',
        name: 'Kite',
        capped: false,
        sound: { voiced: 3, silent: 0, unencoded: true },
      },
    });
    expect(screen.getByText(/This device can’t put sound into a film/)).toBeTruthy();
  });

  it('says nothing of sound when every line is voiced', () => {
    setup({
      job: {
        kind: 'done',
        name: 'Kite',
        capped: false,
        sound: { voiced: 3, silent: 0, unencoded: false },
      },
    });
    expect(screen.queryByText(/silent/)).toBeNull();
  });

  it('shows Preparing the voices as the first step for a film with speak lines', () => {
    const t = timeline();
    setup({
      timeline: {
        ...t,
        lines: [
          {
            scene: sceneId('s1'),
            object: 'owl',
            text: 'Hello',
            kind: 'caption',
            start: 0,
            duration: micros(1),
            length: micros(1),
          },
        ],
      },
      job: { kind: 'running', step: 'voices', fraction: 0, secondsLeft: null },
    });
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps.slice(0, 2)).toEqual(['Preparing the voices', 'Drawing every frame']);
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

  it('lists the check\u2019s flags before export, and still lets the film go', () => {
    setup({
      check: {
        kind: 'ready',
        flags: [
          {
            frame: 'f1' as never,
            frameNumber: '1.1',
            id: 'a',
            words: 'Owl is missing',
            kept: false,
          },
          { frame: 'f1' as never, frameNumber: '1.1', id: 'b', words: 'Kept one', kept: true },
        ],
      },
    });
    expect(screen.getByText(/found one thing to look at. You can export anyway/)).toBeTruthy();
    expect(screen.getByText('Frame 1.1: Owl is missing')).toBeTruthy();
    expect(screen.queryByText('Frame 1.1: Kept one')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export film' })).toHaveProperty('disabled', false);
  });

  it('says when it is checking the film first', () => {
    setup({ check: { kind: 'checking' } });
    expect(screen.getByText('Checking the film against its storyboard…')).toBeTruthy();
  });

  it('says when every frame matches', () => {
    setup({ check: { kind: 'ready', flags: [] } });
    expect(screen.getByText('Every frame matches its storyboard.')).toBeTruthy();
  });

  it("says when the check couldn't finish, can check again, and still lets the film go", async () => {
    const onCheck = vi.fn();
    setup({ check: { kind: 'failed' }, onCheck });
    expect(
      screen.getByText('The check couldn’t finish. You can export anyway, or check again.'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onCheck).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Export film' })).toHaveProperty('disabled', false);
  });

  it('waits for the film to be measured before it can export', () => {
    setup({ timeline: null });
    expect(screen.getByRole('button', { name: 'Export film' })).toHaveProperty('disabled', true);
  });
});
