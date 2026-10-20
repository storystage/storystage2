import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspacePackage } from './boundaries.ts';

/** The workspace folders from pnpm-workspace.yaml. */
export const WORKSPACE_DIRS = ['apps', 'packages', 'tools'] as const;

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export function readWorkspace(root: string): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  for (const group of WORKSPACE_DIRS) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      const file = join(groupDir, entry.name, 'package.json');
      if (!entry.isDirectory() || !existsSync(file)) continue;
      const json = JSON.parse(readFileSync(file, 'utf8')) as PackageJson;
      if (!json.name) continue;
      packages.push({
        name: json.name,
        dir: `${group}/${entry.name}`,
        dependencies: {
          ...json.peerDependencies,
          ...json.devDependencies,
          ...json.dependencies,
        },
      });
    }
  }
  return packages;
}
