/**
 * Backstage on the Production stage (`07-ux.md` section 7.1; decision 0058): a rail of Cast,
 * Props, Set and Backdrops, each opening a panel over the scene view, searchable across all four.
 * Choosing a model and pressing Enter (or Add) puts it on the ground in front of the camera,
 * facing it, as one undo step ("Add owl"); choosing a backdrop sets the scene's ground, sky or
 * lighting. Dragging onto the stage itself waits on the stage's editing contract (S3).
 */
import type { BackstageItem, Section } from '@storystage/backstage';
import { Button, Icon, type IconName } from '@storystage/ui';
import { useState, type ReactNode } from 'react';
import {
  GridList,
  GridListItem,
  Input,
  Label,
  SearchField,
  ToggleButton,
  useDragAndDrop,
} from 'react-aria-components';
import { words } from '../strings.ts';

/** A Backstage item dragged from the rail: its id. */
export const MODEL_DRAG_TYPE = 'application/x-storystage-model';

const SECTIONS: readonly { id: Section; icon: IconName }[] = [
  { id: 'cast', icon: 'groups' },
  { id: 'props', icon: 'category' },
  { id: 'set', icon: 'landscape' },
  { id: 'backdrops', icon: 'flip_to_back' },
];

/** Whether an item matches a search: its name, description or themes. */
const matches = (item: BackstageItem, search: string) => {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [item.displayName, item.description ?? '', ...item.themes].some((t) =>
    t.toLowerCase().includes(q),
  );
};

export interface BackstageRailProps {
  readonly catalogue: readonly BackstageItem[];
  thumbnail(id: BackstageItem['id']): string | null;
  /** Add a model to the scene, or set a backdrop. */
  onUse(item: BackstageItem): void;
  /** False for a read-only film, or before the scene can be set: nothing is added. */
  readonly canAdd: boolean;
  /** The Add button's name for an item, when it isn't "Add Owl to the scene" (the Storyboard's). */
  addLabel?(item: BackstageItem): string;
  /** Under the items: the Storyboard's "Can't find it?". */
  readonly footer?: ReactNode;
  /** Items drag onto the scene view. Off where there's nowhere to drop them. Default true. */
  readonly draggable?: boolean;
}

export function BackstageRail({
  catalogue,
  thumbnail,
  onUse,
  canAdd,
  addLabel,
  footer,
  draggable = true,
}: BackstageRailProps) {
  const [open, setOpen] = useState<Section | null>(null);
  // An item dragged onto the scene view lands where it's dropped (07-ux section 7.2).
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => ({
        [MODEL_DRAG_TYPE]: String(key),
        'text/plain': catalogue.find((i) => i.id === key)?.displayName ?? String(key),
      })),
    getAllowedDropOperations: () => ['copy'],
  });
  const [search, setSearch] = useState('');
  // Searching looks across all four sections (decision 0058); otherwise the open one.
  const shown = catalogue.filter((i) => (search.trim() ? matches(i, search) : i.section === open));
  return (
    <div className="pr-rail-area">
      <nav className="pr-rail" aria-label={words.t('production.backstage')}>
        {SECTIONS.map((s) => (
          <ToggleButton
            key={s.id}
            className="pr-rail-button"
            isSelected={open === s.id}
            onChange={(on) => {
              setOpen(on ? s.id : null);
              setSearch('');
            }}
          >
            <Icon name={s.icon} size={24} />
            <span>{words.t(`production.backstage.${s.id}`)}</span>
          </ToggleButton>
        ))}
      </nav>
      {open && (
        <section className="pr-backstage" aria-label={words.t(`production.backstage.${open}`)}>
          <div className="pr-backstage-head">
            <SearchField className="pr-backstage-search" value={search} onChange={setSearch}>
              <Label className="ss-visually-hidden">{words.t('production.backstage.search')}</Label>
              <Input
                className="ss-input"
                placeholder={words.t('production.backstage.searchPlaceholder')}
              />
            </SearchField>
            <Button
              variant="quiet"
              icon="close"
              aria-label={words.t('production.backstage.close')}
              onPress={() => setOpen(null)}
            />
          </div>
          {shown.length === 0 ? (
            <p className="pr-backstage-note">
              {catalogue.length === 0
                ? words.t('production.backstage.empty')
                : words.t('production.backstage.none')}
            </p>
          ) : (
            <GridList
              className="pr-backstage-items"
              aria-label={words.t(`production.backstage.${open}`)}
              items={shown}
              // Rows are drawn again when what they do changes: a cached row would add to the
              // film as it was, losing what was added since.
              dependencies={[onUse, addLabel, canAdd, draggable, thumbnail]}
              layout="grid"
              disabledBehavior="all"
              disabledKeys={canAdd ? [] : shown.map((i) => i.id)}
              {...(canAdd && draggable ? { dragAndDropHooks } : {})}
              onAction={(key) => {
                const item = catalogue.find((i) => i.id === key);
                if (item && canAdd) onUse(item);
              }}
            >
              {(item) => {
                const picture = thumbnail(item.id);
                const verb = item.section === 'backdrops' ? 'use' : 'add';
                return (
                  <GridListItem
                    id={item.id}
                    className="pr-backstage-item"
                    textValue={item.displayName}
                  >
                    <span className="pr-backstage-thumb" aria-hidden="true">
                      {picture ? (
                        <img src={picture} alt="" />
                      ) : (
                        <Icon name="view_in_ar" size={32} />
                      )}
                    </span>
                    {canAdd && draggable && (
                      <Button
                        slot="drag"
                        variant="quiet"
                        icon="drag_indicator"
                        aria-label={words.t('production.backstage.dragNamed', {
                          name: item.displayName,
                        })}
                      />
                    )}
                    <span className="pr-backstage-name">{item.displayName}</span>
                    <Button
                      slot={null}
                      variant="quiet"
                      icon="add"
                      isDisabled={!canAdd}
                      aria-label={
                        addLabel?.(item) ??
                        words.t(`production.backstage.${verb}Named`, { name: item.displayName })
                      }
                      onPress={() => onUse(item)}
                    >
                      {words.t(`production.backstage.${verb}`)}
                    </Button>
                  </GridListItem>
                );
              }}
            </GridList>
          )}
          {footer}
        </section>
      )}
    </div>
  );
}
