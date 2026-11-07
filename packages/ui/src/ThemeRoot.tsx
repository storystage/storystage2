import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { themeVariables } from './css.ts';
import { fonts, type Theme } from './tokens.ts';

export interface ThemeRootProps {
  /** Dark is the default (decision 0037); light is approved (0038). */
  theme?: Theme;
  /** Text size setting: 1, 1.25 or 1.5 (decision 0035). Scales type, not layout. */
  textSize?: number;
  children: ReactNode;
}

interface ThemeSettings {
  theme: Theme;
  textSize: number;
}

const ThemeContext = createContext<ThemeSettings>({ theme: 'dark', textSize: 1 });

/**
 * The theme's token values, fonts and text size as CSS custom properties. ThemeRoot sets them on
 * its element; anything drawn outside it in a portal (dialogs) sets them on its own root, because
 * custom properties don't reach across a portal.
 */
export function useThemeStyle(): CSSProperties {
  const { theme, textSize } = useContext(ThemeContext);
  return {
    ...themeVariables(theme),
    '--ss-font-display': fonts.display,
    '--ss-font-body': fonts.body,
    '--ss-font-mono': fonts.mono,
    '--ss-text-size': String(textSize),
  } as CSSProperties;
}

/**
 * The root of every StoryStage screen: sets the theme's token values as CSS custom properties, the
 * fonts and the text size. Import `@storystage/ui/styles.css` and `@storystage/ui/fonts` once.
 */
export function ThemeRoot({ theme = 'dark', textSize = 1, children }: ThemeRootProps) {
  return (
    <ThemeContext value={{ theme, textSize }}>
      <ThemedDiv theme={theme}>{children}</ThemedDiv>
    </ThemeContext>
  );
}

function ThemedDiv({ theme, children }: { theme: Theme; children: ReactNode }) {
  return (
    <div className="ss-root" data-theme={theme} style={useThemeStyle()}>
      {children}
    </div>
  );
}
