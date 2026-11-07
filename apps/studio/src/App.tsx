import type { Production } from '@storystage/production';
import { ThemeRoot } from '@storystage/ui';
import { useReducer } from 'react';
import { Shell } from './shell/Shell.tsx';
import { words } from './strings.ts';
import { newProduction } from './storyboard/edits.ts';
import { historyReducer, startHistory, type History } from './storyboard/history.ts';
import { Storyboard } from './storyboard/Storyboard.tsx';

/**
 * The studio. The production is held in memory, with the Storyboard's undo history, until saving
 * and opening arrive (WP8.4). The Production stage and Screening room come with WP7 and WP11b.
 * The theme setting (decision 0037) arrives with Settings; until then the studio is dark.
 */
export function App({ start = newProduction() }: { start?: Production }) {
  const [history, dispatch] = useReducer(
    historyReducer<Production>,
    start,
    startHistory as (p: Production) => History<Production>,
  );
  const title = history.present.manifest.title.trim() || words.t('storyboard.untitled');
  return (
    <ThemeRoot>
      <Shell
        title={title}
        panels={{
          storyboard: <Storyboard history={history} dispatch={dispatch} />,
          production: null,
          screening: null,
        }}
      />
    </ThemeRoot>
  );
}
