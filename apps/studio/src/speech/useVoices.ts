/**
 * The studio's one `Voices` (spec 06 section 4), for Rehearse and the export: loaded only once the
 * film has a speak line, told each change to the film, and asleep (its engine let go) while the
 * learner is in neither the Production stage nor the Screening room.
 */
import type { Production } from '@storystage/production';
import { useEffect, useState } from 'react';
import { hasSpeakLines } from './speakLines.ts';
import type { Voices, VoicesOptions } from './voices.ts';

export function useVoices(
  production: Production,
  awake: boolean,
  options?: VoicesOptions,
): Voices | null {
  const [voices, setVoices] = useState<Voices | null>(null);
  const wanted = voices !== null || hasSpeakLines(production.program);

  // Loaded with the first speak line, and kept for the App's life.
  useEffect(() => {
    if (!wanted || voices) return;
    let live = true;
    void import('./voices.ts').then(
      ({ Voices: Made }) => {
        if (live) setVoices(new Made(options));
      },
      (e: unknown) => console.error('Speak lines could not load.', e),
    );
    return () => {
      live = false;
    };
    // `options` are for tests and last as long as the App.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, voices]);

  useEffect(() => () => voices?.dispose(), [voices]);

  useEffect(() => {
    voices?.update(production);
  }, [voices, production]);

  useEffect(() => {
    if (!awake) voices?.sleep();
  }, [voices, awake]);

  return voices;
}
