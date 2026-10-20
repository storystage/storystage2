/**
 * @storystage/ast: AST types, JSON schema, node ids, validation, edit operations (undo/redo), migrations.
 *
 * Owner: S2. Workplan: WP2.
 *
 * WP0.8 seed: only the names other contracts need, so they can be written before WP2. S2
 * replaces `Program` and `EditOperation` with the real types from `docs/spec/01-ast.md`
 * (WP2.1). The contracts that use them only pass them through, so they keep compiling.
 */

/** A program node's stable id (WP2.1: short, survives edits; copy-paste mints a new one). */
export type NodeId = string & { readonly __nodeId: true };

/** Marks a string as a node id, for tests and fixtures. Real ids are minted by this package. */
export const nodeId = (id: string): NodeId => id as NodeId;

/** A whole program. Placeholder until WP2.1: other packages treat it as opaque. */
export interface Program {
  /** Semantic version of the program format (WP2.6). */
  readonly schemaVersion: string;
}

/**
 * One invertible change to a program (WP2.3). Placeholder until WP2.1. Every edit has a kind and
 * a plain-words label ("Add cat", "Make cat say Hello"), which is also its undo label.
 */
export interface EditOperation {
  readonly kind: string;
  readonly label: string;
}
