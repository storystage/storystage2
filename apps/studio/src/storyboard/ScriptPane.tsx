import type { FrameId, LineId, Production, SceneId, ScriptLine } from '@storystage/production';
import { Button, Icon, TextField, useThemeStyle } from '@storystage/ui';
import { useState } from 'react';
import {
  Button as AriaButton,
  ComboBox,
  GridList,
  GridListItem,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  useDragAndDrop,
  type Key,
  type Selection,
} from 'react-aria-components';
import { words } from '../strings.ts';
import { LIMITS, sceneNumber } from './edits.ts';
import { sceneFrames } from './frames.ts';
import {
  addLine,
  deleteLine,
  lineNumber,
  moveLine,
  pinLine,
  sceneLines,
  setLineText,
  setSpeaker,
  speakerOf,
  speakers,
} from './lines.ts';

export interface ScriptPaneProps {
  production: Production;
  /** The current scene, or `null` when there are no scenes. */
  scene: SceneId | null;
  /** The current frame, which a line pins to first. */
  frame: FrameId | null;
  /** The chosen line, open for editing, or `null`. */
  chosen: LineId | null;
  onChosenChange: (line: LineId | null) => void;
  onChange: (label: string, next: Production, key?: string) => void;
  onLeave: () => void;
  onAnnounce: (text: string) => void;
}

/** The Unpin item's key: frame ids are `f1`, `f2`…, so it can't be one. */
const UNPIN = 'unpin';

const ACTION = () => words.t('storyboard.script.action');

/** "Action" (or nothing) is action; any other name is a character's. */
const whoFrom = (input: string): string | null =>
  input.trim().toLocaleLowerCase('en-GB') === ACTION().toLocaleLowerCase('en-GB')
    ? null
    : speakerOf(input);

/**
 * The script pane (`07-ux.md` section 6.6; WP10.4; Direction A screen 01): the current scene's
 * lines in order, each with its pin; the chosen line open for editing; and a field to add the next
 * line, saying who says it. Lines reorder by their handle, by drag or keyboard, as scene cards do.
 */
export function ScriptPane({
  production: p,
  scene,
  frame,
  chosen,
  onChosenChange,
  onChange,
  onLeave,
  onAnnounce,
}: ScriptPaneProps) {
  const [draft, setDraft] = useState('');
  const [who, setWho] = useState(ACTION());
  const lines = scene ? sceneLines(p, scene) : [];
  const n = scene ? sceneNumber(p, scene) : 0;
  const frames = scene ? sceneFrames(p, scene) : [];
  const frameNumber = (id: FrameId) => `${n}.${frames.findIndex((f) => f.id === id) + 1}`;
  const open = lines.find((l) => l.id === chosen) ?? null;
  const names = scene ? speakers(p, scene) : [];
  const full = p.script.length >= LIMITS.lines;

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder: (e) => {
      const [moving] = [...e.keys] as LineId[];
      if (!moving) return;
      const rest = lines.filter((l) => l.id !== moving).map((l) => l.id);
      const at = rest.indexOf(e.target.key as LineId);
      const to = e.target.dropPosition === 'before' ? at : at + 1;
      onChange(
        words.t('step.moveLine', { number: lineNumber(p, moving) }),
        moveLine(p, moving, to),
      );
    },
  });

  const add = () => {
    if (!scene) return;
    const added = addLine(p, scene, draft, whoFrom(who));
    if (!added) return;
    const number = lineNumber(added.production, added.line);
    onChange(words.t('step.addLine', { number }), added.production);
    setDraft('');
    onAnnounce(words.t('storyboard.script.added', { number }));
  };

  const pin = (line: ScriptLine, to: FrameId | null) => {
    const number = lineNumber(p, line.id);
    onChange(
      to === null
        ? words.t('step.unpinLine', { number })
        : words.t('step.pinLine', { number, frame: frameNumber(to) }),
      pinLine(p, line.id, to),
    );
  };

  return (
    <aside className="sb-script" aria-labelledby="sb-script-title">
      <div className="sb-script-head">
        <Icon name="description" />
        <h2 id="sb-script-title" className="sb-script-title">
          {words.t('storyboard.script')}
        </h2>
        {scene && (
          <span className="sb-script-scene">{words.t('storyboard.script.scene', { n })}</span>
        )}
      </div>

      {!scene ? (
        <p className="sb-script-note">{words.t('storyboard.script.noScene')}</p>
      ) : (
        <>
          <div className="sb-script-lines">
            {lines.length === 0 ? (
              <p className="sb-script-note">{words.t('storyboard.script.none')}</p>
            ) : (
              <GridList
                className="sb-line-list"
                aria-label={words.t('storyboard.script.lines', { n })}
                items={lines}
                selectionMode="single"
                selectionBehavior="replace"
                selectedKeys={open ? [open.id] : []}
                onSelectionChange={(keys: Selection) => {
                  if (keys === 'all') return;
                  const [id] = keys as Set<Key>;
                  onChosenChange((id as LineId | undefined) ?? null);
                }}
                dragAndDropHooks={dragAndDropHooks}
                // Rows are kept for unchanged lines; these redraw them (the pin, the highlight).
                dependencies={[frame, frames.map((f) => f.id).join(), n]}
              >
                {(line) => {
                  const number = lineNumber(p, line.id);
                  const speaker = line.character ?? ACTION();
                  return (
                    <GridListItem
                      id={line.id}
                      textValue={`${speaker}: ${line.text}`}
                      className="sb-line"
                      data-current={(frame !== null && line.pinnedFrame === frame) || undefined}
                    >
                      <AriaButton
                        slot="drag"
                        className="sb-line-handle"
                        aria-label={words.t('storyboard.script.move', { number })}
                      >
                        <Icon name="drag_indicator" size={16} />
                      </AriaButton>
                      <PinMenu
                        line={line}
                        number={number}
                        frames={frames.map((f) => f.id)}
                        current={frame}
                        frameNumber={frameNumber}
                        onPin={(to) => pin(line, to)}
                      />
                      <span className="sb-line-body">
                        <span
                          className="sb-line-speaker"
                          data-action={line.kind === 'action' || undefined}
                        >
                          {speaker}
                        </span>
                        <span className="sb-line-text">{line.text}</span>
                      </span>
                    </GridListItem>
                  );
                }}
              </GridList>
            )}
            {lines.length > 0 && frames.length === 0 && (
              <p className="sb-script-note">{words.t('storyboard.script.noFrames')}</p>
            )}
          </div>

          {open && (
            <div className="sb-line-editor">
              <TextField
                label={words.t('storyboard.script.line', { number: lineNumber(p, open.id) })}
                multiline
                value={open.text}
                maxLength={LIMITS.line}
                onChange={(text) =>
                  onChange(
                    words.t('step.writeLine', { number: lineNumber(p, open.id) }),
                    setLineText(p, open.id, text),
                    `line:${open.id}`,
                  )
                }
                onBlur={onLeave}
              />
              <WhoSaysIt
                // A fresh field when the line or who says it changes elsewhere (undo).
                key={`${open.id}:${open.character ?? ''}`}
                label={words.t('storyboard.script.whoFor', { number: lineNumber(p, open.id) })}
                value={open.character ?? ACTION()}
                names={names}
                onCommit={(input) => {
                  const next = whoFrom(input);
                  if (next === open.character) return;
                  onChange(
                    words.t('step.speaker', { number: lineNumber(p, open.id) }),
                    setSpeaker(p, open.id, next),
                  );
                }}
              />
              <Button
                variant="quiet"
                icon="close"
                onPress={() => {
                  onChange(
                    words.t('step.deleteLine', { number: lineNumber(p, open.id) }),
                    deleteLine(p, open.id),
                  );
                  onChosenChange(null);
                }}
              >
                {words.t('storyboard.script.delete')}
              </Button>
            </div>
          )}

          <div className="sb-line-new">
            <WhoSaysIt
              label={words.t('storyboard.script.who')}
              value={who}
              names={names}
              onCommit={(input) => setWho(whoFrom(input) ?? ACTION())}
            />
            <div className="sb-line-new-row">
              <TextField
                label={words.t('storyboard.script.new')}
                hideLabel
                placeholder={words.t('storyboard.script.typeOrSay')}
                value={draft}
                maxLength={LIMITS.line}
                isDisabled={full}
                onChange={setDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') add();
                }}
              />
              <Button
                variant="secondary"
                icon="add"
                isDisabled={full || draft.trim() === ''}
                onPress={add}
              >
                {words.t('storyboard.script.add')}
              </Button>
            </div>
            {full && (
              <p className="sb-script-note">
                {words.t('storyboard.script.full', { limit: LIMITS.lines })}
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

/**
 * Who says a line: Action, someone in the scene's cast or already in the script, or a name the
 * learner types. The choice is kept when the learner picks one or leaves the field.
 */
function WhoSaysIt({
  label,
  value,
  names,
  onCommit,
}: {
  label: string;
  value: string;
  names: readonly string[];
  onCommit: (input: string) => void;
}) {
  const themeStyle = useThemeStyle();
  const [input, setInput] = useState(value);
  const options = [ACTION(), ...names].map((name) => ({ id: name, name }));
  return (
    <ComboBox
      className="ss-field sb-who"
      allowsCustomValue
      defaultItems={options}
      inputValue={input}
      onInputChange={setInput}
      onSelectionChange={(key) => {
        if (key === null) return;
        setInput(String(key));
        onCommit(String(key));
      }}
      onBlur={() => onCommit(input)}
    >
      <Label className="ss-field-label">{label}</Label>
      <div className="ss-field-row sb-who-row">
        <Input className="ss-input" maxLength={LIMITS.speaker} />
        <AriaButton className="sb-who-button" aria-label={words.t('storyboard.script.showWho')}>
          <Icon name="arrow_drop_down" />
        </AriaButton>
      </div>
      <Popover className="ss-root sb-popover" style={themeStyle}>
        <ListBox className="sb-menu">
          {(item: { id: string; name: string }) => (
            <ListBoxItem id={item.id} className="sb-menu-item">
              {item.name}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

/**
 * A line's pin: its frame's number, or Pin. It offers the current frame first, then the scene's
 * other frames, and Unpin when the line is pinned.
 */
function PinMenu({
  line,
  number,
  frames,
  current,
  frameNumber,
  onPin,
}: {
  line: ScriptLine;
  number: number;
  frames: readonly FrameId[];
  current: FrameId | null;
  frameNumber: (id: FrameId) => string;
  onPin: (to: FrameId | null) => void;
}) {
  const themeStyle = useThemeStyle();
  const pinned = line.pinnedFrame !== null && frames.includes(line.pinnedFrame);
  const ordered = current ? [current, ...frames.filter((f) => f !== current)] : [...frames];
  const items = [
    ...ordered.map((f) => ({
      id: f as string,
      label:
        f === current
          ? words.t('storyboard.script.pinHere', { number: frameNumber(f) })
          : words.t('storyboard.script.pinTo', { number: frameNumber(f) }),
    })),
    ...(pinned ? [{ id: UNPIN, label: words.t('storyboard.script.unpin') }] : []),
  ];
  return (
    <MenuTrigger>
      <AriaButton
        className="sb-pin"
        data-pinned={pinned || undefined}
        isDisabled={frames.length === 0}
        aria-label={
          pinned
            ? words.t('storyboard.script.pinnedLine', {
                number,
                frame: frameNumber(line.pinnedFrame!),
              })
            : words.t('storyboard.script.pinLine', { number })
        }
      >
        <Icon name="keep" size={16} filled={pinned} />
        <span>{pinned ? frameNumber(line.pinnedFrame!) : words.t('storyboard.script.pin')}</span>
      </AriaButton>
      <Popover className="ss-root sb-popover" style={themeStyle}>
        <Menu
          className="sb-menu"
          items={items}
          onAction={(key) => onPin(key === UNPIN ? null : (key as FrameId))}
        >
          {(item) => (
            <MenuItem id={item.id} className="sb-menu-item">
              {item.label}
            </MenuItem>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
