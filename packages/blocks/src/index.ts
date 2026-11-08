/**
 * @storystage/blocks: option B, Blockly made Alice-like (`docs/spec/14-editors.md` section 3i).
 *
 * Owner: S5. Workplan: WP7 (7.2, 7.6). Builds on the editor contract (`@storystage/editor-contract`)
 * and the shared editing model (`@storystage/story-api/editing`, S6).
 *
 * So far: a block type for every Story API entry and node kind, with typed connections (3i.1,
 * 3i.3), and the mapping between a method and its blocks (3i.8). The editor itself, the renderer,
 * the palette and the cascade follow.
 */
export { ALL_TYPES, inputCheck, outputCheck, targetCheck } from './checks.ts';
export { blockTypes, defineBlocks, shapeOf } from './definitions.ts';
export {
  BlocksMismatch,
  SWITCHED_OFF,
  fromBlocks,
  namesOf,
  toBlocks,
  type BlockState,
  type Extra,
  type FromBlocks,
  type WorkspaceState,
} from './mapping.ts';
export {
  ENTRY_NAMES,
  LISTENER,
  METHOD,
  TARGET,
  USER_CALL,
  USER_FUNCTION,
  argInput,
  detailInput,
  enumType,
  nodeType,
  storyShape,
  storyStatementType,
  storyValueType,
  type Part,
  type Shape,
} from './shapes.ts';
