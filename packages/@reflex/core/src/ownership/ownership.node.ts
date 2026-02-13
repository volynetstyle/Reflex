import { IOwnershipContextRecord } from "./ownership.context";

/**
 * @file ownership.node.ts
 *
 * OwnershipNode — optimized fixed-layout owner node with prototype methods.
 *
 * Layout:
 *   - tree links: _parent, _firstChild, _lastChild, _nextSibling, _prevSibling
 *   - context:    _context (lazy, via prototype chain)
 *   - cleanups:   _cleanups (lazy)
 *   - counters:   _childCount, _flags
 *
 * Goals:
 *   - minimal per-node memory footprint (flat fields)
 *   - methods on prototype (no per-instance closures)
 *   - O(1) detach/remove (doubly-linked list)
 *   - dispose subtree: iterative DFS (no recursion, no stack allocations)
 *   - lazy context and cleanups
 */
type Cleanup = NoneToVoidFn | NoneToVoidFn[];

export class OwnershipNode {
  parent: OwnershipNode | null = null;
  firstChild: OwnershipNode | null = null;
  nextSibling: OwnershipNode | null = null;
  prevSibling: OwnershipNode | null = null;

  lastChild: OwnershipNode | null = null;

  // lower 24 bits: childCount
  // upper 8 bits: flags
  meta = 0;

  context: IOwnershipContextRecord | null = null;
  cleanups: Cleanup | null = null;
}
