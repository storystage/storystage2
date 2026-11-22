/**
 * A scene's cast list (`03-production-format.md` section 3; WP10.9): the models and stand-ins the
 * scene uses, whose sketches the library offers. Pure, for `studio.commit`.
 */
import type { Production, SceneId } from '@storystage/production';
import type { BackstageId, StandIn } from '@storystage/story-api';

/** A stand-in's name at most this long: a caption's label, and a name in code. */
export const STAND_IN_NAME_LIMIT = 30;

const sameMember = (a: BackstageId | StandIn, b: BackstageId | StandIn) =>
  typeof a === 'string' || typeof b === 'string'
    ? a === b
    : a.standIn.toLowerCase() === b.standIn.toLowerCase();

/** `p` with `member` in scene `scene`'s cast, or `null` if it's there already (or no scene). */
export function withCastMember(
  p: Production,
  scene: SceneId,
  member: BackstageId | StandIn,
): Production | null {
  const card = p.storyboard.cards.find((c) => c.id === scene);
  if (!card || card.cast.some((c) => sameMember(c, member))) return null;
  return {
    ...p,
    storyboard: {
      ...p.storyboard,
      cards: p.storyboard.cards.map((c) =>
        c.id === scene ? { ...c, cast: [...c.cast, member] } : c,
      ),
    },
  };
}

/**
 * A stand-in's name as typed, tidied: spaces closed up and trimmed. `null` when there's nothing
 * left, or too much.
 */
export function standInName(typed: string): string | null {
  const name = typed.replace(/\s+/g, ' ').trim();
  return name.length === 0 || name.length > STAND_IN_NAME_LIMIT ? null : name;
}
