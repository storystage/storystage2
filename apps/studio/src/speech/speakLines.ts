/**
 * The program's speak lines (spec 06 section 4), found without running it: every `speakLine` call
 * whose words are written in the block, who says it (its object in the scene's set-up) and the
 * script line it came from. Light, so the App can tell whether a film has any before it loads the
 * speech engine.
 */
import type { Expression, NodeId, Program } from '@storystage/ast';
import type { Production, SceneId } from '@storystage/production';

export interface SpeakLineAt {
  /** The block. */
  readonly node: NodeId;
  readonly scene: SceneId;
  /** The speaker's object id in the scene's set-up (its field's name). */
  readonly object: string;
  readonly text: string;
  /** The script line it speaks, if it came from one. */
  readonly line?: string;
  /** The block's own length, in seconds, if it was given one. */
  readonly duration?: number;
}

/** Whether a program has a speak line at all: a quick look, before anything is loaded. */
export const hasSpeakLines = (program: Program): boolean =>
  JSON.stringify(program).includes('"speakLine"');

type Call = {
  readonly id: NodeId;
  readonly kind: 'call';
  readonly target: Expression;
  readonly callee: { readonly kind: string; readonly name?: string };
  readonly args: Readonly<Record<string, Expression>>;
  readonly details: Readonly<Record<string, Expression>>;
};

/** Every node inside `value`, found by walking it. */
function eachNode(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) for (const v of value) eachNode(v, visit);
  else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (typeof node.kind === 'string') visit(node);
    for (const v of Object.values(node)) eachNode(v, visit);
  }
}

/** Every speak line in the production's scenes, in the order the program has them. */
export function speakLines(p: Production): SpeakLineAt[] {
  const found: SpeakLineAt[] = [];
  for (const type of p.program.types) {
    const scene = p.scenes.find((s) => type.methods.some((m) => m.id === s.method));
    if (!scene) continue;
    const fields = new Map(type.fields.map((f) => [f.id as string, f.name]));
    eachNode([type.methods, type.listeners], (node) => {
      if (node.kind !== 'call') return;
      const call = node as unknown as Call;
      if (call.callee.kind !== 'story' || call.callee.name !== 'speakLine') return;
      const target = call.target;
      if (target.kind !== 'fieldRef' || target.target.kind !== 'this') return;
      const object = fields.get(target.field);
      const text = call.args.text;
      if (!object || text?.kind !== 'text' || text.value.trim() === '') return;
      const line = call.details.line;
      const duration = call.details.duration;
      found.push({
        node: call.id,
        scene: scene.id,
        object,
        text: text.value,
        ...(line?.kind === 'text' ? { line: line.value } : {}),
        ...(duration?.kind === 'number' ? { duration: duration.value } : {}),
      });
    });
  }
  return found;
}
