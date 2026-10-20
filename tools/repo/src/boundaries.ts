/**
 * Package boundaries (CLAUDE.md, workplan section 4):
 * - `ast` depends on nothing;
 * - `runtime` depends only on `ast` and `story-api`;
 * - `studio` may depend on everything, and nothing depends on `studio` (or on the `desktop` shell);
 * - workspace packages depend on each other through `workspace:*` only, with no cycles.
 */

export interface WorkspacePackage {
  name: string;
  dir: string;
  dependencies: Record<string, string>;
}

/** Workspace packages each package may depend on. Packages not listed here are unrestricted. */
export const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  '@storystage/ast': [],
  '@storystage/runtime': ['@storystage/ast', '@storystage/story-api'],
};

/** Workspace packages that no other package may depend on. */
export const LEAVES: readonly string[] = ['@storystage/studio', '@storystage/desktop'];

export function checkBoundaries(packages: readonly WorkspacePackage[]): string[] {
  const names = new Set(packages.map((p) => p.name));
  const errors: string[] = [];
  const graph = new Map<string, string[]>();

  for (const pkg of packages) {
    const internal = Object.keys(pkg.dependencies).filter((d) => names.has(d));
    graph.set(pkg.name, internal);
    const allowed = ALLOWED[pkg.name];
    for (const dep of internal) {
      const range = pkg.dependencies[dep];
      if (range !== 'workspace:*') {
        errors.push(`${pkg.name} depends on ${dep} as "${range}"; use "workspace:*".`);
      }
      if (LEAVES.includes(dep)) {
        errors.push(`${pkg.name} depends on ${dep}; nothing may depend on ${dep}.`);
      }
      if (allowed && !allowed.includes(dep)) {
        const list = allowed.length ? allowed.join(', ') : 'nothing';
        errors.push(`${pkg.name} depends on ${dep}; it may depend only on ${list}.`);
      }
    }
  }

  errors.push(...findCycles(graph).map((c) => `Dependency cycle: ${c.join(' -> ')}.`));
  return errors;
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (node: string): void => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const s = state.get(next);
      if (s === 'visiting') cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (s === undefined) visit(next);
    }
    stack.pop();
    state.set(node, 'done');
  };
  for (const node of graph.keys()) if (!state.has(node)) visit(node);
  return cycles;
}
