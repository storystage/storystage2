/**
 * A run's errors in plain words (WP6.3, `CLAUDE.md` rule 9): what happened and what to do next,
 * with no apologies. English only in the first release (decision 0036). The words are all here,
 * keyed by code, so a translation replaces this one table.
 */
import type { RuntimeError, RuntimeErrorCode } from '@storystage/runtime';
import type { StageErrorCode } from '@storystage/story-api';

export const ERROR_WORDS: Readonly<Record<Exclude<RuntimeErrorCode, 'stage'>, string>> = {
  infinite_loop:
    'This loop goes round and round without taking any time, so StoryStage stopped it. Put a block that takes time inside it, or give it a way to end.',
  recursion_limit:
    'This block keeps starting itself again, so StoryStage stopped it. Give it a way to stop.',
  time_slice:
    'Too much is happening at the same moment, so StoryStage stopped it. Let some of it take time.',
  bad_value: "This block got something it can't use. Check what you've put in its spaces.",
  protocol: 'Something went wrong inside StoryStage. Press Play to try again.',
  internal: 'Something went wrong inside StoryStage. Press Play to try again.',
};

export const STAGE_WORDS: Readonly<Record<StageErrorCode, string>> = {
  unknown_object: "This block uses something that isn't in the scene. Add it, or choose another.",
  unknown_joint: "This block uses a part the model hasn't got. Choose another part.",
  unknown_model: "A model in this scene can't be found. Choose it again in Backstage.",
  bad_argument: "The stage can't do what this block asks. Check what you've put in its spaces.",
};

/** The error in plain words, for the learner. */
export function errorWords(error: RuntimeError): string {
  if (error.code === 'stage')
    return error.stageCode === undefined ? STAGE_WORDS.bad_argument : STAGE_WORDS[error.stageCode];
  return ERROR_WORDS[error.code];
}
