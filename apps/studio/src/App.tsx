import { ThemeRoot } from '@storystage/ui';
import { Shell } from './shell/Shell.tsx';

/**
 * The studio. The shell and the three tabs' words are in (WP12); the tabs' working areas come with
 * WP10a (Storyboard), WP7 (Production stage) and WP11b (Screening room). The theme setting (decision
 * 0037) arrives with Settings; until then the studio is dark, the default.
 */
export function App() {
  return (
    <ThemeRoot>
      <Shell panels={{ storyboard: null, production: null, screening: null }} />
    </ThemeRoot>
  );
}
