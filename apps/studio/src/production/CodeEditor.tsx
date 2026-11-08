import type { ListenerDecl, MethodDecl, NodeId } from '@storystage/ast';
import type { CodeEditor as Editor, EditorHost } from '@storystage/editor-contract';
import type { Production, SceneId } from '@storystage/production';
import { STORY_WORDS } from '@storystage/story-api';
import { useEffect, useRef, useState } from 'react';
import { Tab, TabList, TabPanel, Tabs, type Key } from 'react-aria-components';
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

/**
 * The Code editor (`07-ux.md` section 7.3; WP7): one tab per method, each showing the Blocks
 * editor (`@storystage/blocks`, loaded on demand so the Storyboard opens without Blockly).
 */
export function CodeEditor({ production: p, scene, host }: CodeEditorProps) {
  const methods = sceneMethods(p, scene);
  const [chosen, setChosen] = useState<Key | null>(null);
  const open = methods.find((m) => m.id === chosen)?.id ?? methods[0]?.id ?? null;
  const n = sceneNumber(p, scene);
  if (open === null) return null;
  return (
    <section className="pr-code" aria-label={words.t('production.codeOf', { n })}>
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
            <BlocksWorkspace method={m.id} host={host} />
          </TabPanel>
        ))}
      </Tabs>
    </section>
  );
}

/** One method in the Blocks editor, mounted while its tab is open. */
function BlocksWorkspace({ method, host }: { method: NodeId; host: EditorHost }) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let editor: Editor | null = null;
    let gone = false;
    void import('@storystage/blocks').then(({ createBlocksEditor }) => {
      if (gone || !box.current) return;
      editor = createBlocksEditor();
      editor.mount(box.current, host, { method, selection: [], focus: null });
      setReady(true);
    });
    return () => {
      gone = true;
      editor?.unmount();
    };
  }, [method, host]);
  return (
    <div className="pr-workspace-frame">
      {!ready && <p className="pr-loading">{words.t('production.loading')}</p>}
      <div ref={box} className="pr-workspace" data-ready={ready || undefined} />
    </div>
  );
}
