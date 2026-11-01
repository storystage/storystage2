import { COLOR_TOKENS, colors, type ColorToken, type Theme } from './tokens.ts';

/** The CSS custom property for a colour token: `var(--ss-panel-2)`. */
export function cssVar(token: ColorToken): string {
  return `var(--ss-${token})`;
}

/** Every colour token as CSS custom properties, for a theme's root element. */
export function themeVariables(theme: Theme): Record<`--ss-${ColorToken}`, string> {
  const values = colors[theme];
  return Object.fromEntries(COLOR_TOKENS.map((t) => [`--ss-${t}`, values[t]])) as Record<
    `--ss-${ColorToken}`,
    string
  >;
}
