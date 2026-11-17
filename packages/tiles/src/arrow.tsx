/**
 * A value's turning arrow (`arrowOf` in the Story API): Blockly Games' ↺ and ↻ after "left" and
 * "right", as children often mix the two up. Drawn but not read out, so a pill's or a menu
 * item's name stays the plain word a learner says (WCAG 2.5.3).
 */
export function Arrow({ arrow }: { readonly arrow: string | null | undefined }) {
  return arrow ? (
    <span className="tl-arrow" aria-hidden="true">
      {arrow}
    </span>
  ) : null;
}
