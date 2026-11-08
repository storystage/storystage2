/** WP5.7: the sizes a scene picture may be. */
import { StageError } from '@storystage/story-api';

/** Big enough for a 4K still, small enough to keep a Chromebook's memory. */
export const PICTURE_MAX = 4096;

export function checkPictureSize(width: number, height: number): void {
  const fits = (n: number) => Number.isInteger(n) && n > 0 && n <= PICTURE_MAX;
  if (!fits(width) || !fits(height))
    throw new StageError(
      'bad_argument',
      `A picture is a whole number of pixels each way, from 1 to ${PICTURE_MAX}.`,
    );
}
