import { exampleProduction, type Frame } from '@storystage/production';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FramePicture, frameDrawer } from './FramePicture.tsx';

// A frame drawn read-only (07-ux 6.5), for the Screening room's Compare (spec 08, 11.2).

const p = exampleProduction();
const withSketches = p.frames.find((f) => f.sketches.length > 1)!;

describe('FramePicture', () => {
  it('says what is on the frame, back to front', () => {
    render(<FramePicture frame={withSketches} />);
    const picture = screen.getByRole('img');
    expect(picture.getAttribute('aria-label')).toMatch(/^A frame with: .+; .+/);
    expect(picture.querySelectorAll('.sb-picture-sketch')).toHaveLength(
      withSketches.sketches.length,
    );
  });

  it('places, sizes and layers every sketch from its own numbers, as the canvas does', () => {
    render(<FramePicture frame={withSketches} />);
    const drawn = [...document.querySelectorAll<HTMLElement>('.sb-picture-sketch')];
    const inOrder = [...withSketches.sketches].sort((a, b) => a.layer - b.layer);
    inOrder.forEach((sketch, i) => {
      const style = drawn[i]!.style;
      expect(style.left).toBe(`${Math.round(sketch.x * 10000) / 100}%`);
      expect(style.top).toBe(`${Math.round(sketch.y * 10000) / 100}%`);
      expect(style.height).toBe(`${Math.round(0.3 * sketch.scale * 10000) / 100}%`);
      expect(style.zIndex).toBe(String(sketch.layer + 1));
    });
  });

  it('says so when the frame is empty', () => {
    const empty: Frame = { ...withSketches, sketches: [] };
    render(<FramePicture frame={empty} />);
    expect(screen.getByRole('img', { name: 'A frame with no sketches yet' })).toBeTruthy();
  });

  it('flips a flipped sketch, as the canvas does', () => {
    const [first, ...rest] = withSketches.sketches;
    const flipped: Frame = {
      ...withSketches,
      sketches: [{ ...first!, flipped: true }, ...rest.map((k) => ({ ...k, flipped: false }))],
    };
    render(<FramePicture frame={flipped} />);
    expect(document.querySelectorAll('.sb-sketch-art[data-flipped]')).toHaveLength(1);
  });
});

describe('frameDrawer', () => {
  it('draws a frame by its scene and id, and nothing for one the film lacks', () => {
    const draw = frameDrawer(p);
    render(<>{draw(withSketches.scene, withSketches.id)}</>);
    expect(screen.getByRole('img')).toBeTruthy();
    expect(draw(withSketches.scene, 'no-such-frame' as never)).toBeNull();
    expect(draw('no-such-scene' as never, withSketches.id)).toBeNull();
  });
});
