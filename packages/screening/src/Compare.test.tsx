import type { Timeline } from '@storystage/playback';
import {
  exampleProduction,
  frameId,
  sceneId,
  type Frame,
  type Production,
} from '@storystage/production';
import { micros } from '@storystage/story-api';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Compare, RetakeNotes, framesInOrder, type CompareProps } from './Compare.tsx';

const S1 = sceneId('s1');
const S2 = sceneId('s2');

const frame = (id: string, scene: typeof S1, order: number): Frame => ({
  id: frameId(id),
  scene,
  order,
  caption: id,
  shot: 'wide',
  lengthSeconds: 2,
  sketches: [],
  links: [],
});

function production(): Production {
  const p = exampleProduction();
  return {
    ...p,
    frames: [frame('f2b', S2, 1), frame('f1', S1, 0), frame('f2a', S2, 0)],
  };
}

const timeline: Timeline = {
  scenes: [
    { scene: S1, transition: null, start: 0, length: micros(4), waits: false },
    {
      scene: S2,
      transition: { kind: 'cut', duration: 0 },
      start: micros(4),
      length: micros(6),
      waits: false,
    },
  ],
  blocks: [],
  lines: [],
  length: micros(10),
  end: { kind: 'ended' },
  missing: [],
};

describe('framesInOrder', () => {
  it('runs through the scenes in running order, each scene’s frames in storyboard order', () => {
    expect(framesInOrder(production()).map((f) => f.id)).toEqual(['f1', 'f2a', 'f2b']);
  });
});

function setup(over: Partial<CompareProps> = {}) {
  const props: CompareProps = {
    production: production(),
    timeline,
    frame: frameId('f2a'),
    onShow: vi.fn(),
    drawFrame: (scene, f) => <span>{`sketch ${scene} ${f}`}</span>,
    still: { kind: 'none' },
    ...over,
  };
  render(<Compare {...props} />);
  return props;
}

describe('Compare', () => {
  it('shows the sketch of the frame, named by scene and number, beside the film still', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Compare with storyboard' })).toBeTruthy();
    expect(screen.getByText('Frame 2.1')).toBeTruthy();
    expect(screen.getByText('sketch s2 f2a')).toBeTruthy();
    expect(screen.getByText('Your sketch')).toBeTruthy();
    expect(screen.getByText('Film still')).toBeTruthy();
  });

  it('steps through the frames with its arrows', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    expect(props.onShow).toHaveBeenLastCalledWith(frameId('f2b'));
    await userEvent.click(screen.getByRole('button', { name: 'Previous frame' }));
    expect(props.onShow).toHaveBeenLastCalledWith(frameId('f1'));
  });

  it('has no previous frame at the first, and no next at the last', () => {
    setup({ frame: frameId('f1') });
    expect(screen.getByRole('button', { name: 'Previous frame' })).toHaveProperty('disabled', true);
  });

  it('draws the still, named for the moment it shows', () => {
    setup({
      still: {
        kind: 'ready',
        at: micros(5),
        image: { width: 2, height: 1, data: new Uint8ClampedArray(8) },
      },
    });
    expect(screen.getByRole('img', { name: 'The film at 0:05, for frame 2.1' })).toBeTruthy();
  });

  it('says when it is drawing the still, and when the scene never plays', () => {
    setup({ still: { kind: 'drawing' } });
    expect(screen.getByText('Drawing the still…')).toBeTruthy();
  });

  it('says so when the scene does not play in the film', () => {
    setup({ still: { kind: 'notPlayed' } });
    expect(screen.getByText(/doesn't play in the film/)).toBeTruthy();
  });

  it('says so when there are no frames yet', () => {
    setup({ production: { ...production(), frames: [] }, frame: null });
    expect(screen.getByText('This film has no storyboard frames to compare yet.')).toBeTruthy();
  });
});

describe('RetakeNotes', () => {
  it("shows the scene's notes and writes the learner's words, up to 200 characters", async () => {
    const p = production();
    const withNote: Production = {
      ...p,
      storyboard: {
        ...p.storyboard,
        cards: p.storyboard.cards.map((c) =>
          c.id === S2 ? { ...c, retakeNotes: 'Fox is too far.' } : c,
        ),
      },
    };
    const onChange = vi.fn();
    const onDone = vi.fn();
    render(<RetakeNotes production={withNote} scene={S2} onChange={onChange} onDone={onDone} />);
    const box = screen.getByRole('textbox', { name: 'Notes for scene 2' });
    expect(box).toHaveProperty('value', 'Fox is too far.');
    expect(box.getAttribute('maxlength')).toBe('200');
    expect(screen.getByText('185 characters left')).toBeTruthy();
    await userEvent.type(box, '!');
    expect(onChange).toHaveBeenLastCalledWith(S2, 'Fox is too far.!');
    await userEvent.tab();
    expect(onDone).toHaveBeenCalled();
  });

  it('can be read but not changed when the film is read-only', () => {
    render(
      <RetakeNotes
        production={production()}
        scene={S1}
        onChange={vi.fn()}
        onDone={vi.fn()}
        readOnly
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Notes for scene 1' })).toHaveProperty(
      'readOnly',
      true,
    );
  });
});
