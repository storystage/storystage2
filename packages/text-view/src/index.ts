/**
 * @storystage/text-view: Read-only text view with switchable wording (Python-like or Java-like),
 * shared by both editors.
 *
 * Owner: S6. Workplan: WP2.5, WP7 (7.2, 7.6). Spec: `docs/spec/01-ast.md` section 6.
 */
export { constantName, javaText } from './java.ts';
export {
  linesOf,
  textOf,
  TEXT_STYLES,
  type Text,
  type TextLine,
  type TextOptions,
  type TextStyle,
} from './text.ts';
export { TextView, type TextMarks, type TextViewProps } from './view.tsx';
export { t as textViewWord } from './words.ts';
