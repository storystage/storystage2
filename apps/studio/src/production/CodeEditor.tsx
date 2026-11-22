import {
  indexProgram,
  type Expression,
  type ListenerDecl,
  type MethodDecl,
  type NodeId,
} from '@storystage/ast';
import type { EditorHost, EditorId } from '@storystage/editor-contract';
import type { Production, SceneId } from '@storystage/production';
import { STORY_WORDS } from '@storystage/story-api';
import {
  PALETTE_TABS,
  describer,
  isSceneScript,
  methodTitle,
  takesParameters,
  type PaletteTab,
} from '@storystage/story-api/editing';
import { TEXT_STYLES, TextView, textViewWord } from '@storystage/text-view';
import { Icon, Segmented, Toggle, useTabPanel, useThemeStyle } from '@storystage/ui';
import { Suspense, lazy, useMemo, useState } from 'react';
import {
  Button as AriaButton,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  Tab,
  TabList,
  Tabs,
  type Key,
} from 'react-aria-components';
import { words } from '../strings.ts';
import type { Highlights } from './BlocksPanel.tsx';
import { sceneNumber } from '../storyboard/edits.ts';
import {
  characterOf,
  characterOfClass,
  classMethods,
  classWords,
  sceneType,
  type ModelName,
} from './characters.ts';
import { InputsMenu } from './InputsMenu.tsx';
import { NewMethod } from './NewMethod.tsx';
import { useTextViewSetting } from './textViewSetting.ts';
import { EditorSwitch, editorName } from './EditorSwitch.tsx';
import { editorShown, useEditorSetting } from './editorSetting.ts';
import { useHandoff } from './handoff.ts';

export interface CodeEditorProps {
  production: Production;
  scene: SceneId;
  host: EditorHost;
  /** A block to open at: its method's tab, with keyboard focus on it (Screening's Fix). */
  reveal?: NodeId | null;
  /** Rehearse's marks (section 7.4). An error's block has its method's tab opened. */
  highlights?: Highlights;
  /** Set to the editor showing, for the block chosen in it (Rehearse to here). */
  editorRef?: { current: { selection(): readonly NodeId[] } | null };
  /**
   * The class's default editor, from policy (`editor.default`; `14-editors.md` 4.3). Blocks with
   * none. Whether it's locked is the host's `policy.editorLocked`.
   */
  editorDefault?: EditorId;
  /**
   * A study task holds the class's default editor (spec 14 section 6.5): the switch can't change,
   * and says why in these words. Only what's shown is held; the learner's own choice stays theirs.
   */
  held?: string | null;
  /** A Backstage model's name, for a character's own moves (decision 0074); else its id's. */
  modelName?: ModelName;
  /** Opens the Code editor at a block: where an input that can't be removed is used. */
  onReveal?: (node: NodeId) => void;
}

const STORY = STORY_WORDS as Readonly<Record<string, string>>;

/** The scene's methods, one tab each: its script method first, then its listeners, then the rest. */
export function sceneMethods(p: Production, scene: SceneId): (MethodDecl | ListenerDecl)[] {
  const script = p.scenes.find((s) => s.id === scene)?.method;
  const type = p.program.types.find((t) => t.methods.some((m) => m.id === script));
  if (!type) return [];
  const first = type.methods.filter((m) => m.id === script);
  const others = type.methods.filter((m) => m.id !== script);
  return [...first, ...type.listeners, ...others];
}

/**
 * The Code editor's tabs: the scene's methods, then the moves of the characters in it (decision
 * 0074), a class's once however many of its objects the scene has.
 */
export const codeTabs = (p: Production, scene: SceneId): (MethodDecl | ListenerDecl)[] => [
  ...sceneMethods(p, scene),
  ...classMethods(p, scene).map((c) => c.method),
];

/** Which of `methods` holds `node`, or `null` for a node in none of them. */
export function methodHolding(
  p: Production,
  methods: readonly (MethodDecl | ListenerDecl)[],
  node: NodeId,
): NodeId | null {
  const index = indexProgram(p.program);
  const ids = new Set<NodeId>(methods.map((m) => m.id));
  for (let at: NodeId | null = node; at !== null; at = index.get(at)?.parent ?? null)
    if (ids.has(at)) return at;
  return null;
}

/**
 * A tab's name: a method's own, or its listener's words with what it waits for ("when penguin is
 * clicked"), as Tiles words it (spec 14, 3a: this tab row serves both editors). The scene's script
 * method is "When the scene starts" (the owner, 21 Nov), though its code keeps `myFirstMethod`.
 * A character's move says whose it is ("penguin: waddle").
 */
function tabName(p: Production, scene: SceneId, m: MethodDecl | ListenerDecl): string {
  if (m.kind === 'listener') return describer(p.program)(m);
  if (isSceneScript(p.program, m.id)) return methodTitle(p.program, m.id);
  const owner = classMethods(p, scene).find((c) => c.method.id === m.id)?.type;
  return owner
    ? words.t('production.classTab', { model: classWords(owner), name: m.name })
    : m.name;
}

const BlocksPanel = lazy(() => import('./BlocksPanel.tsx'));
const TilesPanel = lazy(() => import('./TilesPanel.tsx'));

/** The palette's object: the scene itself, or one of its objects. */
function paletteTarget(key: Key): Expression {
  const self: Expression = { id: 'palself' as NodeId, kind: 'this' };
  return key === SCENE
    ? self
    : { id: 'palobj' as NodeId, kind: 'fieldRef', target: self, field: key as NodeId };
}
const SCENE = 'scene';

/**
 * The Code editor (`07-ux.md` section 7.3; WP7): the palette's object and tab, then one tab per
 * method, each showing the Blocks editor (`@storystage/blocks`, loaded on demand so the Storyboard
 * opens without Blockly).
 */
export function CodeEditor({
  production: p,
  scene,
  host,
  reveal = null,
  highlights,
  editorRef,
  editorDefault = 'blocks',
  held = null,
  modelName = () => null,
  onReveal,
}: CodeEditorProps) {
  const themeStyle = useThemeStyle();
  // Blocks or Tiles (14-editors section 4): the learner's choice, the class default, or locked.
  // A host without policy (a test's own) leaves the switch unlocked, as the browser's has it.
  const locked =
    held !== null || (host.policy as EditorHost['policy'] | undefined)?.editorLocked === true;
  const [editorChoice, setEditorChoice] = useEditorSetting();
  const shown = editorShown(editorChoice, { default: editorDefault, locked });
  const handoff = useHandoff();
  const methods = codeTabs(p, scene);
  // Opened to show a block: its method first. Each reveal opens the editor afresh (a new key).
  const [chosen, setChosen] = useState<Key | null>(() =>
    reveal ? methodHolding(p, methods, reveal) : null,
  );
  // A rehearsal stopped at an error: its block's method shows, so the error is seen beside it.
  // Only a new error moves the tab; the learner may choose another tab afterwards.
  const errorAt = highlights?.error[0]?.node ?? null;
  const [errorShown, setErrorShown] = useState<NodeId | null>(null);
  if (errorAt !== errorShown) {
    setErrorShown(errorAt);
    const holding = errorAt ? methodHolding(p, methods, errorAt) : null;
    if (holding) setChosen(holding);
  }
  const [object, setObject] = useState<Key>(SCENE);
  const [tab, setTab] = useState<PaletteTab>('actions');
  // Show as text, beside the code, in the wording chosen (07-ux 7.3), kept on this device.
  const [text, setText] = useTextViewSetting();
  const open = methods.find((m) => m.id === chosen)?.id ?? methods[0]?.id ?? null;
  const n = sceneNumber(p, scene);
  const type = p.program.types.find(
    (t) => t.methods.some((m) => m.id === open) || t.listeners.some((l) => l.id === open),
  );
  const own = sceneType(p, scene);
  // In a character's move, its blocks are for "this penguin" only (decision 0074).
  const inClass = type !== undefined && type.id !== own?.id ? type : null;
  const objects = inClass
    ? [{ id: SCENE, name: words.t('production.thisCharacter', { model: classWords(inClass) }) }]
    : [
        { id: SCENE, name: words.t('production.theScene') },
        ...(type?.fields ?? []).map((f) => ({ id: f.id as string, name: f.name })),
      ];
  const picked = objects.some((o) => o.id === object) ? object : SCENE;
  // New's move and question are for the character chosen, or whose move is open.
  const character = inClass
    ? characterOfClass(p, inClass, modelName)
    : picked === SCENE
      ? null
      : characterOf(p, scene, picked as NodeId, modelName);
  const target = useMemo(() => paletteTarget(picked), [picked]);
  // The open method's panel is our own, not React Aria's TabPanel, whose search for a tab stop
  // walked the whole editor on every change (S6, #526; `useTabPanel`).
  const { tabRef, panelRef } = useTabPanel();
  if (open === null) return null;
  const m = methods.find((x) => x.id === open)!;
  return (
    <section
      className="pr-code"
      aria-label={words.t('production.codeOf', { n, editor: editorName(shown) })}
      data-editor={shown}
    >
      <div className="pr-palette-bar">
        <EditorSwitch
          shown={shown}
          locked={locked}
          {...(held !== null ? { lockNote: held } : {})}
          explained={editorChoice.explained}
          program={p.program}
          method={methods.find((m) => m.id === open) ?? null}
          onSwitch={(to, explained) => {
            handoff.switching();
            setEditorChoice({ chosen: to, explained: editorChoice.explained || explained });
            host.announce(words.t('production.nowShowing', { editor: editorName(to) }));
          }}
          onStay={(explained) => {
            if (explained) setEditorChoice({ ...editorChoice, explained: true });
          }}
        />
        <Select
          className="pr-picker"
          selectedKey={picked}
          onSelectionChange={(key) => key !== null && setObject(key)}
        >
          <Label className="pr-picker-label">{words.t('production.blocksFor')}</Label>
          <AriaButton className="pr-picker-button">
            <SelectValue />
            <Icon name="arrow_drop_down" />
          </AriaButton>
          <Popover className="ss-root sb-popover" style={themeStyle}>
            <ListBox className="sb-menu" items={objects}>
              {(o) => (
                <ListBoxItem id={o.id} className="sb-menu-item">
                  {o.name}
                </ListBoxItem>
              )}
            </ListBox>
          </Popover>
        </Select>
        <Segmented
          label={words.t('production.paletteTab')}
          options={PALETTE_TABS.map((t) => ({ id: t, label: STORY[`tab.${t}`] ?? t }))}
          value={tab}
          onChange={setTab}
        />
        <div className="pr-text-choice">
          <Toggle isSelected={text.shown} onChange={(shown) => setText({ ...text, shown })}>
            {words.t('production.showAsText')}
          </Toggle>
          {text.shown && (
            <Segmented
              label={words.t('production.textWording')}
              options={TEXT_STYLES.map((s) => ({ id: s, label: textViewWord(`style.${s}`) }))}
              value={text.style}
              onChange={(style) => setText({ ...text, style })}
            />
          )}
        </div>
      </div>
      {/* Tabs and the panel in one box, as Tabs' own held them, so the layout is as it was. */}
      <div className="pr-tabs-box">
        <Tabs selectedKey={open} onSelectionChange={setChosen}>
          <div className="pr-tab-row">
            <TabList className="pr-tabs" aria-label={words.t('production.methods', { n })}>
              {methods.map((x) => (
                <Tab
                  key={x.id}
                  id={x.id}
                  className="pr-tab"
                  {...(x.id === open ? { ref: tabRef } : {})}
                >
                  {tabName(p, scene, x)}
                </Tab>
              ))}
            </TabList>
            {/* The open procedure's or function's inputs (7.14); none for a script or listener. */}
            {m.kind === 'method' && takesParameters(p.program, m.id) && (
              <InputsMenu
                host={host}
                program={p.program}
                method={m}
                source={shown}
                {...(onReveal ? { onReveal } : {})}
              />
            )}
            {own && (
              <NewMethod
                host={host}
                type={own.id}
                n={n}
                onAdded={setChosen}
                character={character}
                source={shown}
              />
            )}
          </div>
        </Tabs>
        {/* Beside Tabs, not in it: React Aria draws what's in Tabs twice, once hidden. A new
            method's panel is a new one, as React Aria's was. */}
        <div
          key={m.id}
          ref={panelRef}
          role="tabpanel"
          className="pr-tab-panel"
          data-text={text.shown || undefined}
        >
          <Suspense fallback={<p className="pr-loading">{words.t('production.loading')}</p>}>
            {shown === 'tiles' ? (
              <TilesPanel
                method={m.id}
                host={host}
                target={target}
                tab={tab}
                focus={reveal && m.id === chosen ? reveal : null}
                handoff={handoff}
                {...(highlights ? { highlights } : {})}
                {...(editorRef ? { editorRef } : {})}
              />
            ) : (
              <BlocksPanel
                method={m.id}
                host={host}
                target={target}
                tab={tab}
                focus={reveal && m.id === chosen ? reveal : null}
                handoff={handoff}
                {...(highlights ? { highlights } : {})}
                {...(editorRef ? { editorRef } : {})}
              />
            )}
          </Suspense>
          {text.shown && (
            <div className="pr-text">
              <TextView
                program={p.program}
                style={text.style}
                method={m.id}
                label={words.t('production.textOf', { name: tabName(p, scene, m) })}
                {...(highlights ? { highlight: highlights } : {})}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
