import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildManifest, withRollback, withRollout } from './update-manifest.mjs';

const names = [
  'StoryStage-2_1.4.2_x64-setup.exe',
  'StoryStage-2_1.4.2_x64-setup.exe.sig',
  'StoryStage-2.app.tar.gz',
  'StoryStage-2.app.tar.gz.sig',
];
const signatures = {
  'StoryStage-2_1.4.2_x64-setup.exe': 'windows-signature',
  'StoryStage-2.app.tar.gz': 'mac-signature',
};
const manifest = buildManifest('1.4.2', names, signatures, '2026-11-01T00:00:00.000Z');

test('a manifest covers each platform, and the universal Mac build serves both', () => {
  assert.equal(manifest.version, '1.4.2');
  assert.deepEqual(Object.keys(manifest.platforms).sort(), [
    'darwin-aarch64',
    'darwin-x86_64',
    'windows-x86_64',
  ]);
  assert.equal(manifest.platforms['windows-x86_64'].signature, 'windows-signature');
  assert.deepEqual(manifest.platforms['darwin-x86_64'], manifest.platforms['darwin-aarch64']);
});

test('a bundle URL points at that version', () => {
  assert.equal(
    manifest.platforms['windows-x86_64'].url,
    'https://github.com/storystage/storystage2/releases/download/v1.4.2/StoryStage-2_1.4.2_x64-setup.exe',
  );
});

test('a missing bundle or signature stops the release', () => {
  assert.throws(() => buildManifest('1.4.2', names.slice(2), signatures, ''), /setup\.exe/);
  assert.throws(() => buildManifest('1.4.2', names, {}, ''), /No signature/);
});

test('a name with a space stops the release, because GitHub would change it', () => {
  const spaced = ['StoryStage 2_x64-setup.exe', 'StoryStage-2.app.tar.gz'];
  assert.throws(() => buildManifest('1.4.2', spaced, signatures, ''), /no spaces/);
});

test('a rollout is a whole percentage', () => {
  assert.equal(withRollout(manifest, 25).rollout, 25);
  assert.equal(withRollout(manifest, 25).version, '1.4.2');
  for (const bad of [-1, 101, 2.5, NaN]) assert.throws(() => withRollout(manifest, bad));
});

test('a rollback restores the good build, withdraws the bad one and clears the rollout', () => {
  const restored = withRollback(withRollout(manifest, 10), ['1.4.3']);
  assert.equal(restored.version, '1.4.2');
  assert.deepEqual(restored.withdrawn, ['1.4.3']);
  assert.equal('rollout' in restored, false);
  assert.deepEqual(restored.platforms, manifest.platforms);
});

test('a second rollback keeps the first', () => {
  const restored = withRollback(withRollback(manifest, ['1.4.3']), ['1.4.4', '1.4.3']);
  assert.deepEqual(restored.withdrawn, ['1.4.3', '1.4.4']);
});

test('a rollback must name something, and not the build it restores', () => {
  assert.throws(() => withRollback(manifest, []));
  assert.throws(() => withRollback(manifest, ['1.4.2']));
});
