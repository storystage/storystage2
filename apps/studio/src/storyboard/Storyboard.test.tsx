import { exampleProduction } from '@storystage/production';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';

const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const button = (name: RegExp) => screen.getByRole('button', { name });

describe('the script header (10.1)', () => {
  it('starts empty, and the header says the film has no title yet', () => {
    render(<App />);
    expect(field('Title').value).toBe('');
    expect(field('Logline').value).toBe('');
    expect(field('Synopsis').value).toBe('');
    expect(screen.getByRole('banner').textContent).toContain('Untitled film');
    expect(screen.getByText('0 scenes · 0 s')).toBeTruthy();
  });

  it('shows the title in the header as it is typed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(field('Title'), 'The Owl and the Key');
    expect(screen.getByRole('banner').textContent).toContain('The Owl and the Key');
  });

  it('shows an existing production’s plan size', () => {
    render(<App start={exampleProduction()} />);
    expect(field('Logline').value).toContain('A penguin lost in a forest');
    expect(screen.getByText(/^3 scenes · /)).toBeTruthy();
  });

  it('stops at the limit and says so', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(field('Logline'));
    await user.paste('x'.repeat(250));
    expect(field('Logline').value).toHaveLength(200);
    expect(screen.getByText('200 characters at most')).toBeTruthy();
  });
});

describe('undo (07-ux 6.8)', () => {
  it('undoes a field’s typing as one step, named for it', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(button(/^Undo/).hasAttribute('data-disabled')).toBe(true);
    await user.type(field('Logline'), 'A shy owl');
    await user.tab();
    expect(button(/^Undo/).textContent).toBe('Undo: Write logline');
    await user.click(button(/^Undo/));
    expect(field('Logline').value).toBe('');
    expect(screen.getByText('Undone: Write logline')).toBeTruthy();
    await user.click(button(/^Redo/));
    expect(field('Logline').value).toBe('A shy owl');
  });

  it('makes a new step after the learner leaves the field and comes back', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(field('Synopsis'), 'One.');
    await user.tab();
    await user.type(field('Synopsis'), ' Two.');
    await user.tab();
    await user.click(button(/^Undo/));
    expect(field('Synopsis').value).toBe('One.');
  });

  it('undoes and redoes with Ctrl+Z and Ctrl+Shift+Z outside a text field', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(field('Title'), 'Owl');
    await user.click(button(/^Undo/));
    await user.click(button(/^Redo/));
    expect(field('Title').value).toBe('Owl');
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Control>}z{/Control}');
    expect(field('Title').value).toBe('');
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(field('Title').value).toBe('Owl');
  });

  it('leaves Ctrl+Z inside a text field to the field', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(field('Title'), 'Owl');
    await user.keyboard('{Control>}z{/Control}');
    expect(button(/^Undo/).textContent).toBe('Undo: Write title');
  });
});

describe('the arc (10.2)', () => {
  it('starts as 3-part, and lists its parts', () => {
    render(<App />);
    expect((screen.getByRole('radio', { name: '3-part' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Beginning · Middle · End')).toBeTruthy();
  });

  it('changes as one step, named for the new arc', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('radio', { name: '5-part' }));
    expect(screen.getByText('Setup · Conflict · Challenge · Climax · Resolution')).toBeTruthy();
    expect(button(/^Undo/).textContent).toBe('Undo: Change arc to 5-part');
    await user.click(screen.getByRole('radio', { name: 'Free' }));
    expect(screen.getByText('No parts: put your scenes in any order you like.')).toBeTruthy();
    await user.click(button(/^Undo/));
    expect((screen.getByRole('radio', { name: '5-part' }) as HTMLInputElement).checked).toBe(true);
  });
});
