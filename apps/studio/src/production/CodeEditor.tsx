import type { Expression, ListenerDecl, MethodDecl, NodeId } from '@storystage/ast';
import type { EditorHost } from '@storystage/editor-contract';
import type { Production, SceneId } from '@storystage/production';
import { STORY_WORDS } from '@storystage/story-api';
import { PALETTE_TABS, type PaletteTab } from '@storystage/story-api/editing';
import { Icon, Segmented, useThemeStyle } from '@storystage/ui';
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
  TabPanel,
  Tabs,
  type Key,
} from 'react-aria-components';
import { words } from '../strings.ts';
import { sceneNumber } from '../storyboard/edits.ts';

export interface CodeEditorProps {
  production: Production;
  scene: SceneId;
  host: EditorHost;
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

/** A tab's name: a method's own, or an event's words ("when an object is clicked"). */
const tabName = (m: MethodDecl | ListenerDecl) =>
  m.kind === 'method' ? m.name : (STORY[`event.${m.event}`] ?? m.event);

const BlocksPanel = lazy(() => import('./BlocksPanel.tsx'));

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
export function CodeEditor({ production: p, scene, host }: CodeEditorProps) {
  const themeStyle = useThemeStyle();
  const methods = sceneMethods(p, scene);
  const [chosen, setChosen] = useState<Key | null>(null);
  const [object, setObject] = useState<Key>(SCENE);
  const [tab, setTab] = useState<PaletteTab>('actions');
  const open = methods.find((m) => m.id === chosen)?.id ?? methods[0]?.id ?? null;
  const n = sceneNumber(p, scene);
  const type = p.program.types.find(
    (t) => t.methods.some((m) => m.id === open) || t.listeners.some((l) => l.id === open),
  );
  const objects = [
    { id: SCENE, name: words.t('production.theScene') },
    ...(type?.fields ?? []).map((f) => ({ id: f.id as string, name: f.name })),
  ];
  const picked = objects.some((o) => o.id === object) ? object : SCENE;
  const target = useMemo(() => paletteTarget(picked), [picked]);
  if (open === null) return null;
  return (
    <section className="pr-code" aria-label={words.t('production.codeOf', { n })}>
      <div className="pr-palette-bar">
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
      </div>
      <Tabs selectedKey={open} onSelectionChange={setChosen}>
        <TabList className="pr-tabs" aria-label={words.t('production.methods', { n })}>
          {methods.map((m) => (
            <Tab key={m.id} id={m.id} className="pr-tab">
              {tabName(m)}
            </Tab>
          ))}
        </TabList>
        {methods.map((m) => (
          <TabPanel key={m.id} id={m.id} className="pr-tab-panel">
            <Suspense fallback={<p className="pr-loading">{words.t('production.loading')}</p>}>
              <BlocksPanel method={m.id} host={host} target={target} tab={tab} />
            </Suspense>
          </TabPanel>
        ))}
      </Tabs>
    </section>
  );
}
