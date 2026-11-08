import { describe, expect, it } from 'vitest';
import type { Invoke } from './speech.ts';
import { describeClassFoldersContract } from './testing/conformance.ts';
import { memoryClassFolders } from './testing/memory-files.ts';
import { countingFor, tauriUsage, USAGE_COMMANDS } from './usage.ts';

/** Records whose folder the native layer was told is open. */
function native() {
  const told: (string | null)[] = [];
  const invoke: Invoke = async (command, args) => {
    if (command === USAGE_COMMANDS.pupil) {
      told.push((args as { pupil: string | null }).pupil);
    }
    return undefined;
  };
  return { told, invoke };
}

describeClassFoldersContract('the class folders, counting for the Prompter', () =>
  countingFor(memoryClassFolders(), native().invoke),
);

describe('whom the Prompter counts against (spec 05 section 2.4)', () => {
  it('is the pupil whose folder is open, and nobody once it closes', async () => {
    const { told, invoke } = native();
    const classes = countingFor(memoryClassFolders(), invoke);
    const ava = await classes.addPupil('Ava');
    const ben = await classes.addPupil('Ben');
    await classes.open(ava.id);
    await classes.open(ben.id);
    await classes.close();
    expect(told).toEqual([ava.id, ben.id, null]);
  });

  it('is nobody when the device’s own folder is open', async () => {
    const { told, invoke } = native();
    const classes = countingFor(memoryClassFolders(), invoke);
    await classes.openDevice();
    expect(told).toEqual([null]);
  });

  it('isn’t changed by Collect and Hand back reaching another folder', async () => {
    const { told, invoke } = native();
    const classes = countingFor(memoryClassFolders(), invoke);
    const ava = await classes.addPupil('Ava');
    const ben = await classes.addPupil('Ben');
    await classes.open(ava.id);
    await classes.folder(ben.id);
    expect(told).toEqual([ava.id]);
  });

  it('is nobody once the open pupil is removed, and unchanged when another is', async () => {
    const { told, invoke } = native();
    const classes = countingFor(memoryClassFolders(), invoke);
    const ava = await classes.addPupil('Ava');
    const ben = await classes.addPupil('Ben');
    await classes.open(ava.id);
    await classes.removePupil(ben.id);
    await classes.removePupil(ava.id);
    expect(told).toEqual([ava.id, null]);
  });

  it('still opens the folder if the native layer can’t be told', async () => {
    const failing: Invoke = () => Promise.reject(new Error('no answer'));
    const classes = countingFor(memoryClassFolders(), failing);
    const ava = await classes.addPupil('Ava');
    expect((await classes.open(ava.id)).pupil.id).toBe(ava.id);
  });
});

describe('the day’s usage', () => {
  const reply = {
    date: '2026-11-08',
    level: 'full',
    dailyCap: 20,
    capAction: 'explainOnly',
    entries: [
      { pupil: null, used: 2, level: 'full' },
      { pupil: 'pupil-ava', used: 24, level: 'explainOnly' },
    ],
  };

  it('reads what the native layer gives', async () => {
    const usage = tauriUsage(async (command) => (command === 'prompter_usage' ? reply : null));
    expect(await usage.today()).toEqual(reply);
  });

  it('refuses a reply it can’t read', async () => {
    for (const wrong of [
      null,
      { ...reply, level: 'max' },
      { ...reply, entries: [{ used: 'a' }] },
    ]) {
      await expect(tauriUsage(async () => wrong).today()).rejects.toThrow();
    }
  });
});
