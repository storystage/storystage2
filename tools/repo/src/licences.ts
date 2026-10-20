/**
 * Licence policy (CLAUDE.md rule 8, workplan constraint 5, WP0.6):
 * - linked into the app (`dependencies`): permissive licences and MPL-2.0 (file-level, used unmodified);
 * - build and test tools (`devDependencies`): the same, plus GPL and LGPL for tools whose output we
 *   ship but which are never linked into the app;
 * - never: AGPL, SSPL, non-commercial or unlicensed packages.
 * Anything the policy does not recognise fails until it is reviewed and added to the exceptions file.
 */

export type Verdict = 'allowed' | 'build-only' | 'disallowed' | 'unknown';

const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSL-1.0',
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
  'Unicode-3.0',
  'Unlicense',
  'WTFPL',
  'Zlib',
]);
const BUILD_ONLY = /^L?GPL-(2\.0|2\.1|3\.0)(-only|-or-later|\+)?$/;
const DISALLOWED = /^(AGPL-|SSPL-|CC-BY-NC|CC-BY-ND|UNLICENSED$|BUSL-)/;

const RANK: Record<Verdict, number> = { allowed: 0, 'build-only': 1, unknown: 2, disallowed: 3 };
const worst = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);
const best = (a: Verdict, b: Verdict): Verdict => (RANK[a] <= RANK[b] ? a : b);

function single(id: string): Verdict {
  const clean = id.replace(/^\(+|\)+$/g, '').trim();
  if (ALLOWED.has(clean)) return 'allowed';
  if (BUILD_ONLY.test(clean)) return 'build-only';
  if (DISALLOWED.test(clean)) return 'disallowed';
  return 'unknown';
}

/** The verdict for an SPDX expression. `A OR B` takes the better side, `A AND B` the worse. */
export function licenceVerdict(expression: string): Verdict {
  const text = expression.trim().replace(/^\((.*)\)$/, '$1');
  if (!text) return 'unknown';
  return text
    .split(/\s+OR\s+/i)
    .map((alt) =>
      alt
        .split(/\s+AND\s+/i)
        .map(single)
        .reduce(worst),
    )
    .reduce(best);
}

export interface Dependency {
  name: string;
  versions: string[];
  licence: string;
}

export interface LicenceException {
  /** `name@version`, or `name` for every version. */
  package: string;
  licence: string;
  reason: string;
  approved: string;
}

export interface Problem {
  dependency: Dependency;
  verdict: Verdict;
  linked: boolean;
}

/** Dependencies that break the policy. `linked` is true for packages that ship in the app. */
export function findProblems(
  linked: readonly Dependency[],
  tools: readonly Dependency[],
  exceptions: readonly LicenceException[] = [],
): Problem[] {
  const excepted = (d: Dependency) =>
    exceptions.some(
      (e) => e.package === d.name || d.versions.some((v) => e.package === `${d.name}@${v}`),
    );
  const problems: Problem[] = [];
  for (const dependency of linked) {
    const verdict = licenceVerdict(dependency.licence);
    if (verdict !== 'allowed' && !excepted(dependency))
      problems.push({ dependency, verdict, linked: true });
  }
  for (const dependency of tools) {
    const verdict = licenceVerdict(dependency.licence);
    if ((verdict === 'unknown' || verdict === 'disallowed') && !excepted(dependency))
      problems.push({ dependency, verdict, linked: false });
  }
  return problems;
}

export function describeProblem({ dependency: d, verdict, linked }: Problem): string {
  const where = linked ? 'linked into the app' : 'a build or test tool';
  const why =
    verdict === 'build-only'
      ? 'GPL-family licences are allowed only for build tools, never in the app'
      : verdict === 'disallowed'
        ? 'this licence is not allowed anywhere'
        : 'this licence is not in the policy yet: review it, then allow it or add an exception';
  return `${d.name}@${d.versions.join(', ')} (${d.licence || 'no licence'}), ${where}: ${why}.`;
}

const row = (d: Dependency) => `${d.name}  ${d.versions.join(', ')}  ${d.licence}`;

/** NOTICE, generated from the lockfile. Sorted, so it only changes when dependencies change. */
export function renderNotice(
  header: string,
  linked: readonly Dependency[],
  tools: readonly Dependency[],
): string {
  const sort = (list: readonly Dependency[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return [
    header.trimEnd(),
    '',
    `== Linked into the app (${linked.length}) ==`,
    '',
    ...sort(linked).map(row),
    '',
    `== Build and test tools, not shipped (${tools.length}) ==`,
    '',
    ...sort(tools).map((d) => {
      const mark = licenceVerdict(d.licence) === 'build-only' ? '  [build only: GPL family]' : '';
      return row(d) + mark;
    }),
    '',
  ].join('\n');
}

/** Flattens `pnpm licenses list --json` output, leaving out the workspace's own packages. */
export function fromPnpmLicences(json: Record<string, { name: string; versions: string[] }[]>) {
  const out: Dependency[] = [];
  for (const [licence, entries] of Object.entries(json)) {
    for (const e of entries) {
      if (e.name.startsWith('@storystage/')) continue;
      out.push({ name: e.name, versions: [...e.versions].sort(), licence });
    }
  }
  return out;
}
