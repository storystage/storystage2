/**
 * @storystage/a3p-import: Alice 3 worlds (`.a3p`) into StoryStage (WP9).
 *
 * Owner: S6. Workplan: WP9. 9.1, reading the file safely, is `readA3p`; 9.2, mapping it onto
 * the StoryStage program, comes with WP9b. It reads untrusted files, so it runs in the import
 * worker (spec 15, section 3): it uses no DOM and fetches nothing.
 */
export * from './code.ts';
export * from './decode.ts';
export * from './gaps.ts';
export * from './read.ts';
export { SIMS2_MODELS } from './sims.ts';
export * from './world.ts';
export { decodeText, encodingOf, type TextEncoding } from './text.ts';
export {
  childElements,
  childNamed,
  parseXml,
  textOf,
  XML_MAX_DEPTH,
  XmlRefused,
  type XmlElement,
  type XmlNode,
  type XmlProblemCode,
} from './xml.ts';
