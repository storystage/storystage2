import { browserHost, type HostInterface } from '@storystage/host';
import { memoryClassFolders, memoryFilePicker } from '@storystage/host/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { ClassSetup } from '../settings/ClassSetup.tsx';

// The warning when the browser may clear films (S8's `storagePersistent`, #272; 07-ux 9.2).

const MAY_CLEAR = /may clear your films if space runs low/;

async function browserWith(storagePersistent: () => Promise<boolean>): Promise<HostInterface> {
  const classes = memoryClassFolders();
  await classes.addPupil('Sam');
  return {
    ...browserHost,
    version: null,
    classes,
    picker: memoryFilePicker(),
    storagePersistent,
  };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('the browser’s one note', () => {
  it('adds the warning when the browser hasn’t agreed to keep films', async () => {
    render(<App host={await browserWith(async () => false)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    expect(await screen.findByText(MAY_CLEAR)).toBeTruthy();
    expect(screen.getByText(/kept in this browser on this device/)).toBeTruthy();
  });

  it('says nothing more when it has', async () => {
    render(<App host={await browserWith(async () => true)} />);
    await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
    expect(await screen.findByText(/kept in this browser on this device/)).toBeTruthy();
    expect(screen.queryByText(MAY_CLEAR)).toBeNull();
  });
});

describe('Class set-up', () => {
  it('warns when the browser hasn’t agreed to keep films', async () => {
    render(<ClassSetup host={await browserWith(async () => false)} />);
    expect(await screen.findByText(MAY_CLEAR)).toBeTruthy();
  });

  it('draws without waiting for an answer that hasn’t come', async () => {
    // Firefox answers only once the person answers its own prompt.
    render(<ClassSetup host={await browserWith(() => new Promise<boolean>(() => {}))} />);
    expect(await screen.findByRole('row', { name: 'Open Sam’s folder' })).toBeTruthy();
    expect(screen.queryByText(MAY_CLEAR)).toBeNull();
  });
});
