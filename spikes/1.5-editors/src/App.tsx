import { BlocklyEditor } from './BlocklyEditor.tsx';
import { TileEditor } from './TileEditor.tsx';

/** `?editor=tiles` (option C) or `?editor=blockly` (option B). */
export function App() {
  const editor = new URLSearchParams(location.search).get('editor') ?? 'tiles';
  return (
    <main>
      <nav>
        <a href="?editor=blockly" aria-current={editor === 'blockly' ? 'page' : undefined}>
          Option B: Blockly
        </a>{' '}
        <a href="?editor=tiles" aria-current={editor === 'tiles' ? 'page' : undefined}>
          Option C: tiles
        </a>
      </nav>
      {editor === 'blockly' ? <BlocklyEditor /> : <TileEditor />}
    </main>
  );
}
