/**
 * @storystage/sound: when and how loud the film's music plays (decision 0076, workplan 11.7), and
 * Rehearse's player. The Sound view's timeline draws it (`heardMusic`), and Rehearse's player
 * (`LiveSounds`, through `createSoundOut`) and the export play it (`musicPlays`), so the film sounds
 * as the timeline shows and as Rehearse played it.
 *
 * Owner: S3. Spec: `docs/spec/03-production-format.md`, section 2.3; `07-ux.md`, section 7.7.
 */
export * from './live.ts';
export * from './music.ts';
export * from './out.ts';
export * from './plays.ts';
