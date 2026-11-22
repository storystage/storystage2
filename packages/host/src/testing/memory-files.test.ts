import { describe, expect, it } from 'vitest';
import { FileError } from '../files.ts';
import { describeClassFoldersContract } from './conformance.ts';
import { memoryClassFolders, memoryFilePicker } from './memory-files.ts';

describeClassFoldersContract('memoryClassFolders', () => memoryClassFolders());

describe('the size limit (S4, #191)', () => {
  const small = new Uint8Array(10);
  const large = new Uint8Array(11);

  it('refuses to keep a production over the limit', async () => {
    const folders = memoryClassFolders(undefined, 10);
    const folder = await folders.open((await folders.addPupil('Ava')).id);
    await expect(folder.write(null, 'Film', large)).rejects.toMatchObject({ code: 'too_big' });
    const { key } = await folder.write(null, 'Film', small);
    await expect(folder.write(key, 'Film', large)).rejects.toMatchObject({ code: 'too_big' });
    expect((await folder.read(key)).length).toBe(10);
  });

  it('refuses to open or hand back a file over the limit', async () => {
    const picker = memoryFilePicker(
      {
        open: () => ({ name: 'big.storystage', bytes: large }),
        handBack: () => [{ folder: 'Ava', file: 'big.storystage', bytes: large }],
      },
      10,
    );
    await expect(picker.open()).rejects.toMatchObject({ code: 'too_big' });
    await expect(picker.handBack()).rejects.toMatchObject({ code: 'too_big' });
  });
});

describe('memoryFilePicker', () => {
  const bytes = new TextEncoder().encode('a film');

  it('keeps what was saved and collected', async () => {
    const picker = memoryFilePicker();
    await picker.saveCopy('The Owl.storystage', bytes);
    const count = await picker.collect([{ folder: 'Ava', file: 'The Owl.storystage', bytes }]);
    expect(count).toBe(1);
    expect(picker.saved.map((file) => file.name)).toEqual(['The Owl.storystage']);
    expect(picker.collected.map((file) => `${file.folder}/${file.file}`)).toEqual([
      'Ava/The Owl.storystage',
    ]);
  });

  it('refuses a Collect with two files of the same name, and writes nothing', async () => {
    const picker = memoryFilePicker();
    const twice = { folder: 'Ava', file: 'The Owl.storystage', bytes };
    await expect(picker.collect([twice, twice])).rejects.toMatchObject({ code: 'invalid' });
    expect(picker.collected).toEqual([]);
  });

  it('plays its answers, and closing the picker is cancelled', async () => {
    const picker = memoryFilePicker({
      open: () => ({ name: 'x.storystage', bytes }),
      handBack: () => null,
    });
    expect((await picker.open()).name).toBe('x.storystage');
    await expect(picker.handBack()).rejects.toBeInstanceOf(FileError);
    await expect(picker.handBack()).rejects.toMatchObject({ code: 'cancelled' });
    await expect(memoryFilePicker().open()).rejects.toMatchObject({ code: 'cancelled' });
  });
});
