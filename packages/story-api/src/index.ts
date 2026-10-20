/**
 * @storystage/story-api: The StoryStage 2 Story API: classes, procedures, functions, details and joints, using Alice's vocabulary.
 *
 * Owner: S6 (spec and types), S3 (procedures and character actions). Workplan: WP4.
 *
 * WP0.8: the shared vocabulary that the runtime, the stage, Backstage and the production
 * format all use. It lives here because the runtime may depend only on `ast` and `story-api`.
 */
export * from './vocabulary.ts';
export * from './stage-commands.ts';
