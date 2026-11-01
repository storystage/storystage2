import type { CSSProperties, ReactNode } from 'react';
import { themeVariables } from './css.ts';
import { fonts, type Theme } from './tokens.ts';

export interface ThemeRootProps {
  /** Dark is the default (decision 0037); light is approved (0038). */
  theme?: Theme;
  /** Text size setting: 1, 1.25 or 1.5 (decision 0035). Scales type, not layout. */
  textSize?: number;
  children: ReactNode;
}

/**
 * The root of every StoryStage screen: sets the theme's token values as CSS custom properties, the
 * fonts and the text size. Import `@storystage/ui/styles.css` and `@storystage/ui/fonts` once.
 */
export function ThemeRoot({ theme = 'dark', textSize = 1, children }: ThemeRootProps) {
  const style = {
    ...themeVariables(theme),
    '--ss-font-display': fonts.display,
    '--ss-font-body': fonts.body,
    '--ss-font-mono': fonts.mono,
    '--ss-text-size': String(textSize),
  } as CSSProperties;
  return (
    <div className="ss-root" data-theme={theme} style={style}>
      {children}
    </div>
  );
}
