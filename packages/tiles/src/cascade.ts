/**
 * @storystage/tiles/cascade: the cascade menus on their own, for the Blocks editor (spec 14,
 * §2.3 and §3i.6: one cascade for both editors, spike 1.5 finding 1).
 *
 * - `ValueMenu`: the values that fit a slot, opening on the one there now or the suggestion.
 * - `AskValue`: a value the learner types ("Other number…"), checked against its limit.
 * - `DetailMenu`: "add detail ▾".
 *
 * Each opens from `anchor`, in a portal, and carries the tile colours itself, so it looks the
 * same over Blocks as over Tiles. Escape or a click outside calls `onClose`.
 */
import './tiles.css';

export {
  AskValue,
  DetailMenu,
  ValueMenu,
  type AskProps,
  type DetailMenuProps,
  type ValueMenuProps,
} from './menus.tsx';
