import type { FrameId, Production } from '@storystage/production';
import { BACKDROP_SKETCHES, MARKS, SKETCH_LIMIT } from '@storystage/sketches';
import { backstageId } from '@storystage/story-api';
import { Icon } from '@storystage/ui';
import {
  Button as AriaButton,
  GridList,
  GridListItem,
  useDragAndDrop,
  type Key,
} from 'react-aria-components';
import { words } from '../strings.ts';
import { SketchArt, sketchName, type SketchItem } from './SketchArt.tsx';

/** What a library item carries when it is dragged onto a frame. */
export const SKETCH_DRAG_TYPE = 'application/x-storystage-sketch';

export interface SketchLibraryProps {
  production: Production;
  /** The frame sketches go on, and its number ("2.3"); `null` when the scene has no frame. */
  frame: { id: FrameId; number: string } | null;
  onAdd: (item: SketchItem) => void;
}

const keyOf = (item: SketchItem) =>
  typeof item === 'string' ? `id:${item}` : `standIn:${item.standIn}`;

/** The cast on the production's cards, each once. */
function castItems(p: Production): SketchItem[] {
  const seen = new Map<string, SketchItem>();
  for (const card of p.storyboard.cards) for (const c of card.cast) seen.set(keyOf(c), c);
  return [...seen.values()];
}

/**
 * The sketch library (Direction A screen 01; `07-ux.md` section 6.1): the production's cast and
 * props, the storyboard marks and the backdrop sketches. Choose one and press Enter, or click it,
 * to put it in the middle of the frame, or drag it onto the frame. Model sketches join when
 * Backstage's catalogue loads (WP3c).
 */
export function SketchLibrary({ production: p, frame, onAdd }: SketchLibraryProps) {
  const current = frame ? p.frames.find((f) => f.id === frame.id) : undefined;
  const full = (current?.sketches.length ?? 0) >= SKETCH_LIMIT;
  const usable = frame !== null && !full;
  const cast = castItems(p);
  const sections: { id: string; title: string; items: SketchItem[] }[] = [
    { id: 'cast', title: words.t('storyboard.library.cast'), items: cast },
    {
      id: 'marks',
      title: words.t('storyboard.library.marks'),
      items: MARKS.map((m) => backstageId(m.id)),
    },
    {
      id: 'backdrops',
      title: words.t('storyboard.library.backdrops'),
      items: BACKDROP_SKETCHES.map((b) => backstageId(b.id)),
    },
  ];

  return (
    <aside className="sb-library" aria-labelledby="sb-library-title">
      <h2 id="sb-library-title" className="sb-library-title">
        {words.t('storyboard.library')}
      </h2>
      {!frame && <p className="sb-library-note">{words.t('storyboard.library.noFrame')}</p>}
      {full && (
        <p className="sb-library-note">
          {words.t('storyboard.library.full', { limit: SKETCH_LIMIT })}
        </p>
      )}
      {sections.map((section) => (
        <LibrarySection
          key={section.id}
          title={section.title}
          items={section.items}
          frameNumber={frame?.number ?? null}
          isDisabled={!usable}
          onAdd={onAdd}
          empty={section.id === 'cast' ? words.t('storyboard.library.noCast') : null}
        />
      ))}
    </aside>
  );
}

function LibrarySection({
  title,
  items,
  frameNumber,
  isDisabled,
  onAdd,
  empty,
}: {
  title: string;
  items: SketchItem[];
  frameNumber: string | null;
  isDisabled: boolean;
  onAdd: (item: SketchItem) => void;
  empty: string | null;
}) {
  const byKey = new Map(items.map((i) => [keyOf(i), i]));
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => ({
        [SKETCH_DRAG_TYPE]: JSON.stringify(byKey.get(String(key))),
        'text/plain': sketchName(byKey.get(String(key))!),
      })),
  });
  return (
    <section className="sb-library-section">
      <h3 className="sb-library-heading">{title}</h3>
      {items.length === 0 ? (
        empty && <p className="sb-library-note">{empty}</p>
      ) : (
        <GridList
          className="sb-library-list"
          aria-label={title}
          layout="grid"
          items={items.map((item) => ({ id: keyOf(item), item }))}
          disabledBehavior="all"
          disabledKeys={isDisabled ? items.map(keyOf) : []}
          onAction={(key: Key) => {
            const item = byKey.get(String(key));
            if (item) onAdd(item);
          }}
          // Always given (hooks can't come and go); disabled items don't drag.
          dragAndDropHooks={dragAndDropHooks}
        >
          {({ id, item }) => {
            const name = sketchName(item);
            return (
              <GridListItem
                id={id}
                textValue={name}
                aria-label={
                  frameNumber
                    ? words.t('storyboard.library.add', { name, number: frameNumber })
                    : name
                }
                className="sb-library-item"
              >
                <AriaButton
                  slot="drag"
                  className="sb-library-handle"
                  aria-label={words.t('storyboard.library.drag', { name })}
                >
                  <Icon name="drag_indicator" size={16} />
                </AriaButton>
                <SketchArt item={item} />
                <span className="sb-library-name">{name}</span>
              </GridListItem>
            );
          }}
        </GridList>
      )}
    </section>
  );
}
