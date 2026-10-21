/**
 * Spike 1.7: a Babylon.js scene and a Blockly workspace, together, inside the Tauri Android app
 * (the reference Chromebook runs Android apps). The scene is spike 1.2's walking characters and
 * the workspace is spike 1.5's Alice-style Blockly, so the same code is tested here.
 * After 10 seconds the page shows its numbers and prints them to the Android log as one line,
 * `SPIKE17 {...}`, so CI can read them from the emulator.
 */
import {
  Color4,
  Engine,
  FreeCamera,
  HemisphericLight,
  MeshBuilder,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlocklyEditor } from '../../1.5-editors/src/BlocklyEditor.tsx';
import '../../1.5-editors/src/styles.css';
import { animate, makeCharacter } from '../../1.2-models/src/rigs.ts';

function Stage({ onResult }: { onResult: (r: Record<string, unknown>) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const engine = new Engine(canvas.current!, true, { stencil: false });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.75, 0.85, 0.95, 1);
    const camera = new FreeCamera('camera', new Vector3(0, 2, -6), scene);
    camera.setTarget(new Vector3(0, 0.8, 0));
    new HemisphericLight('light', new Vector3(0.3, 1, -0.4), scene);
    MeshBuilder.CreateGround('ground', { width: 12, height: 12 }, scene);
    const cast = (['biped', 'quadruped', 'biped'] as const).map((kind, i) => {
      const c = makeCharacter(scene, kind, 5_000, 512, i * 90);
      c.mesh.position.x = (i - 1) * 1.6;
      return c;
    });
    const intervals: number[] = [];
    let last = performance.now();
    const start = last;
    let reported = false;
    engine.runRenderLoop(() => {
      const now = performance.now();
      intervals.push(now - last);
      last = now;
      cast.forEach((c, i) => animate(c, (now - start) / 1000 + i * 0.3));
      scene.render();
      if (!reported && now - start > 10_000) {
        reported = true;
        const sorted = intervals.slice(30).sort((a, b) => a - b);
        const at = (p: number) =>
          Math.round((sorted[Math.floor(sorted.length * p)] ?? 0) * 10) / 10;
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        onResult({
          userAgent: navigator.userAgent,
          renderer: engine.getGlInfo().renderer,
          webgl: engine.webGLVersion,
          fps: Math.round((sorted.length / ((now - start) / 1000 - 0.5)) * 10) / 10,
          medianMs: at(0.5),
          p95Ms: at(0.95),
          stutters: sorted.filter((x) => x > 50).length,
          triangles: cast.reduce((n, c) => n + c.triangles, 0),
          blocklyBlocks: document.querySelectorAll('.blocklyDraggable').length,
          jsHeapMb: memory ? Math.round(memory.usedJSHeapSize / 1e5) / 10 : null,
          hidden: document.visibilityState === 'hidden',
        });
      }
    });
    return () => engine.dispose();
  }, [onResult]);
  return (
    <canvas
      ref={canvas}
      style={{ width: '100%', height: '42vh', display: 'block', touchAction: 'none' }}
    />
  );
}

function App() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const report = useRef((r: Record<string, unknown>) => {
    // One line for CI to find in the Android log (adb logcat).
    console.log(`SPIKE17 ${JSON.stringify(r)}`);
    setResult(r);
  }).current;
  return (
    <main>
      <h1 style={{ fontSize: '1.1rem', margin: '0.5rem' }}>
        Spike 1.7: Babylon.js and Blockly in the Android app
      </h1>
      <Stage onResult={report} />
      <BlocklyEditor />
      <pre style={{ margin: '0.5rem', fontSize: '0.8rem' }}>
        {result
          ? JSON.stringify(result, null, 2)
          : 'Measuring for 10 seconds… keep the app in view.'}
      </pre>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
