import { ids, sampleProgram } from '@storystage/ast/testing';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextView } from './view.tsx';

const rows = (region: HTMLElement) => [...region.querySelectorAll<HTMLElement>('.tv-line')];

describe('TextView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is a region named for its method, one row per line', () => {
    render(<TextView program={sampleProgram()} style="python" method={ids.main} />);
    const region = screen.getByRole('region', { name: 'Text of When the scene starts' });
    expect(region.tabIndex).toBe(0);
    expect(rows(region).map((r) => r.textContent)).toContain('    self.cat.say(text="Hello")');
    expect(rows(region)[0]!.dataset.node).toBe(ids.main);
  });

  it('takes its name from the caller, and shows the whole program without a method', () => {
    render(<TextView program={sampleProgram()} style="java" label="Code as text" />);
    const region = screen.getByRole('region', { name: 'Code as text' });
    expect(rows(region)[0]!.textContent).toBe('class Scene1 extends Scene {');
  });

  it('switches wording when the style changes', () => {
    const { rerender } = render(
      <TextView program={sampleProgram()} style="python" method={ids.main} />,
    );
    const region = screen.getByRole('region');
    expect(rows(region)[4]!.textContent).toBe('    self.cat.say(text="Hello")');
    rerender(<TextView program={sampleProgram()} style="java" method={ids.main} />);
    expect(rows(region)[5]!.textContent).toBe('    this.cat.say("Hello");');
  });

  it('marks the running block’s lines, an error with its words, and the Prompter’s', () => {
    render(
      <TextView
        program={sampleProgram()}
        style="java"
        method={ids.main}
        highlight={{
          rehearse: [{ node: ids.count }],
          error: [{ node: ids.say, message: 'There’s no scene called Beach' }],
          prompter: [{ node: ids.count }],
        }}
      />,
    );
    const lines = rows(screen.getByRole('region'));
    const marked = (kind: string) =>
      lines.flatMap((r, i) => (r.classList.contains(`tv-hl-${kind}`) ? [i] : []));
    expect(marked('rehearse')).toEqual([10, 11, 12]);
    expect(marked('prompter')).toEqual([10, 11, 12]);
    expect(marked('error')).toEqual([5]);
    expect(lines[5]!.querySelector('.tv-message')!.textContent).toBe(
      'There’s no scene called Beach',
    );
    expect(lines[11]!.querySelector('.tv-message')).toBeNull();
  });

  it('keeps the running line in view as it moves', () => {
    const seen: string[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      seen.push((this as HTMLElement).dataset.line ?? '');
    });
    const program = sampleProgram();
    const { rerender } = render(
      <TextView
        program={program}
        style="java"
        method={ids.main}
        highlight={{ rehearse: [{ node: ids.say }] }}
      />,
    );
    rerender(
      <TextView
        program={program}
        style="java"
        method={ids.main}
        highlight={{ rehearse: [{ node: ids.callHop }] }}
      />,
    );
    expect(seen).toEqual(['5', '25']);
  });

  it('notes the Python-like words Python hasn’t got, keeping the line’s text', () => {
    render(<TextView program={sampleProgram()} style="python" />);
    const region = screen.getByRole('region');
    const notes = [...region.querySelectorAll<HTMLElement>('.tv-not-python')];
    expect(notes.map((n) => n.textContent)).toEqual([
      'when', // what runs the scene's script method
      'do_together',
      'each_together',
      'do_in_order',
      'when',
    ]);
    expect(notes[1]!.title).toMatch(/^Not in Python/);
    expect(notes[1]!.closest('.tv-line')!.textContent).toBe('        do_together:');
    // Not in the Java-like wording, nor on a word that only starts the same.
    render(<TextView program={sampleProgram()} style="java" label="Java" />);
    const java = screen.getByRole('region', { name: 'Java' });
    expect(java.querySelector('.tv-not-python')).toBeNull();
  });

  it('says so when there’s nothing to show', () => {
    render(<TextView program={{ schemaVersion: '1.0.0', types: [] }} style="python" />);
    expect(screen.getByRole('region', { name: 'Text of the program' }).textContent).toBe(
      'Nothing to show',
    );
  });
});
