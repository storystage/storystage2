/**
 * A block's menu (`14-editors.md` sections 2.6 and 3i.7). It is the shared statement menu,
 * `@storystage/story-api/editing`'s `menuFor` and `changeFor`, so Blocks and Tiles offer the same
 * commands in the same words. `editor.ts` puts them in Blockly's menu and its keys.
 */
export {
  changeFor,
  detailPlace,
  menuFor,
  type MenuAction,
  type MenuChange,
  type MenuItem,
} from '@storystage/story-api/editing';
