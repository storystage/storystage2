import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';

describe('App', () => {
  it('names the three tabs', () => {
    const html = renderToString(<App />);
    for (const tab of ['Storyboard', 'Production stage', 'Screening room']) {
      expect(html).toContain(tab);
    }
  });
});
