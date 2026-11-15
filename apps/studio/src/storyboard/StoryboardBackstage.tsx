/**
 * Backstage from the Storyboard (WP10.9; `07-ux.md` section 6.1): the same rail of Cast, Props,
 * Set and Backdrops as the Production stage's, searching the whole catalogue (shipped and the
 * class's), its panel opening over the sketch library. Choosing a model adds it to the scene's
 * cast, so its sketch joins the library; a backdrop puts its sketch on the frame. "Can't find
 * it?" stands one in: a labelled outline with a name, which keeps that name in code when a real
 * model replaces it, and says where importing is, when the school allows it.
 */
import type { BackstageItem } from '@storystage/backstage';
import type { BackstageImport } from '@storystage/host';
import { Button } from '@storystage/ui';
import { useState } from 'react';
import { Input, Label, TextField } from 'react-aria-components';
import { BackstageRail } from '../production/BackstageRail.tsx';
import { words } from '../strings.ts';
import { STAND_IN_NAME_LIMIT, standInName } from './cast.ts';

export interface StoryboardBackstageProps {
  readonly catalogue: readonly BackstageItem[];
  thumbnail(id: BackstageItem['id']): string | null;
  /** The scene's number, for the buttons' names; null with no scene to add to. */
  readonly scene: number | null;
  /** The frame a backdrop's sketch goes on: "1.1", or null. */
  readonly frame: string | null;
  readonly readOnly: boolean;
  /** Who may import models, from the school's policy. */
  readonly importing: BackstageImport;
  onAddToCast(item: BackstageItem): void;
  onBackdrop(item: BackstageItem): void;
  /** Adds a stand-in to the cast; says why not when it can't. */
  onStandIn(name: string): string | null;
}

export function StoryboardBackstage({
  catalogue,
  thumbnail,
  scene,
  frame,
  readOnly,
  importing,
  onAddToCast,
  onBackdrop,
  onStandIn,
}: StoryboardBackstageProps) {
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const canAdd = !readOnly && scene !== null;
  const standIn = () => {
    const name = standInName(typed);
    if (!name)
      return setProblem(
        words.t('storyboard.backstage.standInName', { limit: STAND_IN_NAME_LIMIT }),
      );
    const refused = onStandIn(name);
    setProblem(refused);
    if (!refused) setTyped('');
  };
  const footer = (
    <div className="sb-cantfind">
      <h2 className="sb-cantfind-title">{words.t('storyboard.backstage.cantFind')}</h2>
      {canAdd ? (
        <>
          <p className="sb-cantfind-note">{words.t('storyboard.backstage.standInHelp')}</p>
          <form
            className="sb-cantfind-row"
            onSubmit={(e) => {
              e.preventDefault();
              standIn();
            }}
          >
            <TextField
              className="sb-cantfind-field"
              value={typed}
              onChange={(v) => {
                setTyped(v);
                setProblem(null);
              }}
              maxLength={STAND_IN_NAME_LIMIT}
            >
              <Label className="sb-cantfind-label">
                {words.t('storyboard.backstage.standInLabel')}
              </Label>
              <Input
                className="ss-input"
                placeholder={words.t('storyboard.backstage.standInPlaceholder')}
              />
            </TextField>
            <Button type="submit" variant="secondary" icon="person_add">
              {words.t('storyboard.backstage.standIn', { n: scene ?? 0 })}
            </Button>
          </form>
          {problem && (
            <p className="sb-cantfind-note" role="alert">
              {problem}
            </p>
          )}
        </>
      ) : null}
      {importing !== 'off' && (
        <p className="sb-cantfind-note">
          {words.t(
            importing === 'learners'
              ? 'storyboard.backstage.importYou'
              : 'storyboard.backstage.importTeacher',
          )}
        </p>
      )}
    </div>
  );
  return (
    <BackstageRail
      catalogue={catalogue}
      thumbnail={thumbnail}
      canAdd={canAdd}
      draggable={false}
      footer={footer}
      addLabel={(item) =>
        item.section === 'backdrops'
          ? words.t('storyboard.backstage.backdropNamed', {
              name: item.displayName,
              frame: frame ?? '',
            })
          : words.t('storyboard.backstage.castNamed', { name: item.displayName, n: scene ?? 0 })
      }
      onUse={(item) => (item.section === 'backdrops' ? onBackdrop(item) : onAddToCast(item))}
    />
  );
}
