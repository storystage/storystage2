/**
 * "Set up this scene from your storyboard?" (WP10.10): offered the first time a scene opens on
 * the Production stage while its storyboard shows something its stage doesn't have. It lists the
 * cast, props, set and backdrop it found, with Place everything, Choose what to place and Not
 * now. Placing is one undo step; Not now leaves "Set up from storyboard" under the view.
 */
import { Button, Checkbox } from '@storystage/ui';
import { useState } from 'react';
import { words } from '../strings.ts';
import type { Placement } from './fromStoryboard.ts';

export interface StoryboardSetupProps {
  readonly plan: readonly Placement[];
  /** "1.1": the frame the placing follows. */
  readonly frameNumber: string;
  onPlace(chosen: readonly Placement[]): void;
  onNotNow(): void;
}

const SECTIONS = ['cast', 'props', 'set', 'backdrops'] as const;
type Section = (typeof SECTIONS)[number];

const sectionOf = (p: Placement): Section => (p.kind === 'backdrop' ? 'backdrops' : p.section);

/** One thing in plain words: "Knight", "Owl, waiting off stage", "Forest floor as the ground". */
function placementWords(p: Placement): string {
  if (p.kind === 'backdrop')
    return words.t('production.fromStoryboard.backdrop', {
      name: p.name,
      part: words.t(`production.backstage.part.${p.part}`),
    });
  return p.offStage ? words.t('production.fromStoryboard.offStage', { name: p.name }) : p.name;
}

export function StoryboardSetup({ plan, frameNumber, onPlace, onNotNow }: StoryboardSetupProps) {
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(plan.map((p) => p.key)));
  const groups = SECTIONS.map((s) => ({ s, items: plan.filter((p) => sectionOf(p) === s) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <section className="pr-from-storyboard" aria-labelledby="pr-from-storyboard-title">
      <h2 id="pr-from-storyboard-title" className="pr-from-storyboard-title">
        {words.t('production.fromStoryboard.title')}
      </h2>
      <p className="pr-from-storyboard-note">
        {words.t('production.fromStoryboard.found', { n: frameNumber })}
      </p>
      <div className="pr-from-storyboard-groups">
        {groups.map(({ s, items }) => (
          <div key={s} className="pr-from-storyboard-group">
            <h3 className="pr-from-storyboard-section">{words.t(`production.backstage.${s}`)}</h3>
            {choosing ? (
              items.map((p) => (
                <Checkbox
                  key={p.key}
                  isSelected={chosen.has(p.key)}
                  onChange={(on) => {
                    const next = new Set(chosen);
                    if (on) next.add(p.key);
                    else next.delete(p.key);
                    setChosen(next);
                  }}
                >
                  {placementWords(p)}
                </Checkbox>
              ))
            ) : (
              <ul className="pr-from-storyboard-list">
                {items.map((p) => (
                  <li key={p.key}>{placementWords(p)}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="pr-from-storyboard-actions">
        {choosing ? (
          <>
            <Button
              variant="primary"
              isDisabled={chosen.size === 0}
              onPress={() => onPlace(plan.filter((p) => chosen.has(p.key)))}
            >
              {words.plural('production.fromStoryboard.placeThese', chosen.size)}
            </Button>
            <Button variant="quiet" onPress={() => setChoosing(false)}>
              {words.t('production.fromStoryboard.back')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" icon="groups" onPress={() => onPlace(plan)}>
              {words.t('production.fromStoryboard.everything')}
            </Button>
            <Button variant="secondary" onPress={() => setChoosing(true)}>
              {words.t('production.fromStoryboard.choose')}
            </Button>
            <Button variant="quiet" onPress={onNotNow}>
              {words.t('production.fromStoryboard.notNow')}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
