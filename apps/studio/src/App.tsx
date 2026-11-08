import type { Production } from '@storystage/production';
import { ThemeRoot, type Mode } from '@storystage/ui';
import { useState } from 'react';
import { ProductionStage } from './production/ProductionStage.tsx';
import { useEditorHost } from './production/editorHost.ts';
import { Shell } from './shell/Shell.tsx';
import { words } from './strings.ts';
import { newProduction } from './storyboard/edits.ts';
import { NOWHERE, currentPlace, type Place } from './storyboard/place.ts';
import { Storyboard } from './storyboard/Storyboard.tsx';
import { useStudio } from './studio.ts';

/**
 * The studio. The production is held in the production's own session (`studio.ts`): one undo
 * history for the Storyboard, the Code editor and the stage. Saving and opening (WP8.4) follow. The current scene and frame are shared by
 * the tabs (07-ux section 1). The Screening room comes with WP11b. The theme setting (decision
 * 0037) arrives with Settings; until then the studio is dark.
 */
export function App({ start = newProduction() }: { start?: Production }) {
  const studio = useStudio(start);
  const [place, setPlace] = useState<Place>(NOWHERE);
  const [mode, setMode] = useState<Mode>('storyboard');
  const [said, setSaid] = useState('');
  const host = useEditorHost(studio.session, setSaid);
  const p = studio.production;
  const title = p.manifest.title.trim() || words.t('storyboard.untitled');
  return (
    <ThemeRoot>
      <Shell
        title={title}
        mode={mode}
        onModeChange={setMode}
        panels={{
          storyboard: <Storyboard studio={studio} place={place} onPlaceChange={setPlace} />,
          production: (
            <ProductionStage
              production={p}
              scene={currentPlace(p, place).scene}
              host={host}
              onGoToStoryboard={() => setMode('storyboard')}
              announcement={said}
            />
          ),
          screening: null,
        }}
      />
    </ThemeRoot>
  );
}
