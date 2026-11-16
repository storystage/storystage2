/**
 * The text view on its own, for looking at it: `pnpm --filter @storystage/text-view harness`, then
 * http://localhost:4185/. `?style=java`, `?theme=light` and `?method=` (`all` for the whole program)
 * choose what it shows; Rehearse's mark steps through the method's statements.
 */
import { ids, sampleProgram } from '@storystage/ast/testing';
import { ThemeRoot } from '@storystage/ui';
import '@storystage/ui/fonts';
import '@storystage/ui/styles.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { textOf, TextView, type TextStyle } from '../src/index.ts';

const query = new URLSearchParams(location.search);
const style = (query.get('style') ?? 'python') as TextStyle;
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
const method = query.get('method') === 'all' ? undefined : ids.main;
const program = sampleProgram();
const running = [
  ...new Set(textOf(program, { style, method: ids.main }).lines.map((l) => l.node)),
].filter((n) => n !== null && n !== ids.main);

function Page() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % running.length), 1200);
    return () => clearInterval(timer);
  }, []);
  return (
    <ThemeRoot theme={theme}>
      <div style={{ padding: 16, height: '100vh', boxSizing: 'border-box' }}>
        <TextView
          program={program}
          style={style}
          method={method}
          highlight={{
            rehearse: [{ node: running[step]! }],
            error: [{ node: ids.local, message: 'There’s nothing called x here' }],
            prompter: [{ node: ids.note }],
          }}
        />
      </div>
    </ThemeRoot>
  );
}

createRoot(document.getElementById('text-view')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
