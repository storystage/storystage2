/**
 * @storystage/ast: AST types, JSON schema, node ids, validation, edit operations (undo/redo), migrations.
 *
 * Owner: S2. Workplan: WP2. Spec: `docs/spec/01-ast.md`.
 */
export * from './build.ts';
export * from './ids.ts';
export * from './nodes.ts';
export * from './schema.ts';
export * from './serialize.ts';
export * from './validate.ts';
export * from './version.ts';
export * from './walk.ts';

/**
 * One invertible change to a program (WP2.3). Placeholder until WP2.3 lands. Every edit has a
 * kind and a plain-words label ("Add cat", "Make cat say Hello"), which is also its undo label.
 */
export interface EditOperation {
  readonly kind: string;
  readonly label: string;
}
