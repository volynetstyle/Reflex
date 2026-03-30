import { getDefaultContext, type ExecutionContext } from "../context";
import { recompute } from "../engine/compute";
import type { ReactiveNode } from "../shape";
import { DIRTY_STATE, type ReactiveEdge, ReactiveNodeState } from "../shape";
import { propagateOnce } from "./propagate";

// Refresh a single dependency node and return whether its value changed.
//
// Two cases:
//
//  1. Producer (e.g. a writable signal): value was already committed on write,
//     so we just read the Changed flag and clear dirty state. No recompute needed.
//
//     signal.set(42)
//       └─ marks Changed, sets dirty bits
//     refreshDependency(link, signal)
//       └─ reads Changed=true, clears bits, returns true
//
//  2. Computed node: recompute() reruns the user function. If the result
//     changed AND the node has multiple subscribers, push the change sideways
//     via propagateOnce so sibling consumers don't miss it.
//
//     computed C depends on signal A and signal B.
//     Only A changed → recompute(C) runs → new value differs → changed=true.
//     If D and E both depend on C → hasFanout=true → propagateOnce(C)
//     marks D and E invalid immediately (push side) so they don't pull stale.

/**
 * Update a dependency node and return whether its value changed.
 *
 * This handles two different node kinds:
 *
 * **Producers**: Mutable sources commit their new value immediately during write.
 * We just read the Changed flag to know if they changed, clear the dirty bit,
 * and return the result. No computation needed.
 *
 * **Consumers**: Derived computations must re-execute via recompute() to get the
 * new value. If it changed, and this dependency has multiple subscribers, we
 * immediately notify siblings via propagateOnce() so they don't miss the change.
 *
 * @param {ReactiveNode} node - The dependency node to check/update
 * @param {number} state - Current state of the node (optimization: avoid re-reading)
 * @returns {boolean} True if the node's value changed, false if same
 *
 * @modifies node.state - Clears dirty bits
 * @modifies subscribers - If computed and changed with fanout, siblings promoted
 *
 * @cost O(1) for producers, O(compute) for computed nodes
 */
function refreshDependency(
  link: ReactiveEdge,
  node: ReactiveNode,
  context: ExecutionContext,
  state = node.state,
): boolean {
  let changed = false;

  if ((state & ReactiveNodeState.Producer) !== 0) {
    // Producer: just read the change status, clear dirty.
    node.state = state & ~DIRTY_STATE;
    changed = (state & ReactiveNodeState.Changed) !== 0;
  } else {
    // Computed: re-execute to get the next value.
    changed = recompute(node, context);
  }

  // If changed and has fanout (multiple subscribers), notify siblings
  if (changed && (link.prevOut !== null || link.nextOut !== null)) {
    propagateOnce(node, context);
  }

  return changed;
}

/**
 * Depth-first walk with explicit stack for branching dependencies.
 *
 * Used when a consumer has multiple incoming dependencies or when a dependency
 * itself has multiple dependencies. The explicit stack handles the complexity of
 * maintaining the walk state across multiple branches.
 *
 * @param {ReactiveEdge} link - Current edge being processed
 * @param {ReactiveNode} consumer - Current consumer/dependency being walked
 * @param {ReactiveEdge[]} stack - Explicit stack of parent edges to backtrack through
 * @param {number} stackTop - Current top of stack (-1 if empty)
 * @returns {boolean} Whether any upstream change was found
 *
 * @cost O(m * n) where m = depth, n = average branching factor
 */
function shouldRecomputeBranching(
  link: ReactiveEdge,
  consumer: ReactiveNode,
  context: ExecutionContext,
  stack: ReactiveEdge[],
  stackTop: number,
): boolean {
  let changed = false;

  // Stack entries remember which parent edge should be refreshed after the
  // current dependency subtree finishes resolving.
  outer: while (true) {
    const dep = link.from;
    const depState = dep.state;

    // Check if consumer already marked Changed (shortcuts all dep checks)
    if ((consumer.state & ReactiveNodeState.Changed) !== 0) {
      changed = true;
    }
    // Check if this dependency definitely changed
    else if ((depState & ReactiveNodeState.Changed) !== 0) {
      changed = refreshDependency(link, dep, context, depState);
    }
    // Check if dependency is dirty and needs verification
    else if (
      (depState & ReactiveNodeState.Producer) === 0 &&
      (depState & DIRTY_STATE) !== 0
    ) {
      // Dependency might be dirty due to its own dependencies
      const deps = dep.firstIn;
      if (deps !== null) {
        // Push current edge to stack, descend into dependency's dependencies
        stackTop += 1;
        stack[stackTop] = link;
        link = deps;
        consumer = dep;
        continue;
      }

      // No dependencies, just refresh and determine if changed
      changed = refreshDependency(link, dep, context, depState);
    }

    // Process next dependency or backtrack
    if (!changed) {
      // Not changed yet, try next sibling
      const next = link.nextIn;
      if (next !== null) {
        link = next;
        continue;
      }

      // No more siblings at this level, mark clean
      consumer.state &= ~ReactiveNodeState.Invalid;
    }

    // Backtrack through stack to parent level
    while (stackTop >= 0) {
      const parentLink = stack[stackTop]!;
      stackTop -= 1;

      if (changed) {
        // Upstream changed, refresh parent
        changed = refreshDependency(parentLink, consumer, context);
      } else {
        // Still clean, mark parent clean
        consumer.state &= ~ReactiveNodeState.Invalid;
      }

      consumer = parentLink.to;

      if (!changed) {
        // Continue looking for changes in siblings
        const next = parentLink.nextIn;
        if (next !== null) {
          link = next;
          continue outer;
        }
      }
    }

    return changed;
  }
}

/**
 * Pull-side depth-first walk over incoming dependencies.
 *
 * Stays on the cheap linear path while there are no dirty branches,
 * and escalates to stack-backed DFS only when descent is needed.
 *
 * Called when a computed node is about to re-execute and needs to know
 * whether any upstream value actually changed, or whether the dirty flag
 * was a false alarm (e.g. a signal was set to the same value).
 *
 * **Dependency graph terminology used in comments below:**
 *
 * - "dep" — an upstream node that `sub` reads from
 * - "sub" — the consumer currently being inspected (starts as `node`)
 * - "link" — the ReactiveEdge connecting dep → sub
 *
 * **Example graph (all arrows = "depends on"):**
 *
 * ```
 *     A (signal, Changed)
 *     │
 *     B (computed, Invalid)   ← node passed in
 *    / \
 *   C   D (both computed, Invalid)
 * ```
 *
 * Walk order: B→C first (linear), then B→D, descend into each if dirty.
 *
 * **Return value:**
 * - `true` — at least one upstream value changed; caller should recompute node.
 * - `false` — all dirty flags were stale; node value is still valid.
 *
 * @param {ReactiveNode} node - The consumer to check for actual changes
 * @param {ReactiveEdge} firstIn - First incoming edge (dependency) of the node
 * @returns {boolean} Whether any upstream value actually changed
 *
 * @cost O(m) where m = depth of dependency tree * average fanout
 * @invariant Walks all incoming edges, checking each recursively if needed
 * @invariant Clears dirty bits for verified clean nodes
 * @invariant Re-executes dependencies that actually changed
 */
function shouldRecomputeLinear(
  node: ReactiveNode,
  firstIn: ReactiveEdge,
  context: ExecutionContext,
): boolean {
  // Explicit stack for DFS when branching is needed
  const stack: ReactiveEdge[] = [];
  let stackTop = -1;
  // Current edge being processed
  let link = firstIn;
  // Current node whose dependencies are being checked
  let consumer = node;
  // Has any upstream change been confirmed?
  let changed = false;

  while (true) {
    if (link.nextIn !== null) {
      // Multiple dependencies: switch to branching for efficiency
      return shouldRecomputeBranching(link, consumer, context, stack, stackTop);
    }

    // Single dependency: stay on linear path

    // Check if consumer already marked Changed (confirmed change from propagate)
    if ((consumer.state & ReactiveNodeState.Changed) !== 0) {
      changed = true;
      break;
    }

    // Check the dependency
    const dep = link.from;
    const depState = dep.state;

    // Case 1: Dependency is already Changed (confirmed by propagate)
    if ((depState & ReactiveNodeState.Changed) !== 0) {
      changed = refreshDependency(link, dep, context, depState);
      break;
    }

    // Case 2: Dependency is dirty but not Producer
    // (computed nodes need verification, producers are already verified)
    if (
      (depState & ReactiveNodeState.Producer) === 0 &&
      (depState & DIRTY_STATE) !== 0
    ) {
      // Check if dependency has its own dependencies to walk
      const deps = dep.firstIn;
      if (deps !== null) {
        if (deps.nextIn !== null) {
          // Multiple deps of current dep: switch to branching
          stackTop += 1;
          stack[stackTop] = link;
          return shouldRecomputeBranching(deps, dep, context, stack, stackTop);
        }

        // Single dep: continue down linear path
        stackTop += 1;
        stack[stackTop] = link;
        link = deps;
        consumer = dep;
        continue;
      }

      // No dependencies, must recompute to know if changed
      changed = refreshDependency(link, dep, context, depState);
      break;
    }

    // Case 3: Dependency is clean or is a Producer
    // No change, mark consumer clean and move to next dependency
    consumer.state &= ~ReactiveNodeState.Invalid;

    // Backtrack or move to next dependency
    if (stackTop < 0) return false;

    link = stack[stackTop]!;
    stackTop -= 1;
    consumer = link.to;
  }

  // Backtrack through stack, propagating change status upward
  while (stackTop >= 0) {
    const parentLink = stack[stackTop]!;
    stackTop -= 1;

    if (changed) {
      // If any descendant changed, refresh parent too
      changed = refreshDependency(parentLink, consumer, context);
    } else {
      // All descendants clean, mark parent clean
      consumer.state &= ~ReactiveNodeState.Invalid;
    }

    consumer = parentLink.to;
  }

  // Final clean-up if no change found
  if (!changed) consumer.state &= ~ReactiveNodeState.Invalid;
  return changed;
}

/**
 * Verify if a node needs recomputation due to actual upstream changes.
 *
 * This is called during pull-phase when a consumer is marked Invalid but not Changed.
 * Invalid means "might have changed" (due to transitive propagation), but we need to
 * confirm actual upstream change before re-executing user code.
 *
 * The walk handles special cases:
 * - **Producers**: Never need verification (changes committed eagerly)
 * - **Changed flag**: Already confirmed by propagate, no walk needed
 * - **Re-entrance marker**: If both Visited and Invalid flags are set, it means
 *   this consumer was computing while propagate walked its dependencies. This forces
 *   re-execution since the compute observed a stale prefix.
 * - **Linear case**: Single dependency, stay on fast path
 * - **Branching case**: Multiple dependencies, use DFS with stack
 *
 * @param {ReactiveNode} node - The consumer to check
 * @returns {boolean} Whether the node should be recomputed
 *
 * @example
 * const signal = createProducer(1)
 * const computed = createConsumer(() => signal * 2)
 * const sub = createConsumer(() => {
 *   computed.state |= Invalid  (from transitive propagation)
 *   return shouldRecompute(computed)  // → walks signal's state
 * })
 *
 * @cost O(m) where m = depth of dependency graph
 * @invariant Returns true only if upstream actually changed
 * @invariant Clears dirty bits for verified clean paths
 */
export function shouldRecompute(node: ReactiveNode): boolean {
  const state = node.state;

  // Producers commit eagerly on write; pull-side walk is never needed for them.
  if ((state & ReactiveNodeState.Producer) !== 0) return false;

  // Already confirmed changed upstream (e.g. by push-side propagate) — no walk needed.
  if ((state & ReactiveNodeState.Changed) !== 0) return true;

  // If a tracked dependency invalidated this node while it was computing,
  // propagate() leaves Visited|Invalid behind as the re-entrancy marker.
  // That means the current execution observed a stale prefix and must rerun.
  if (
    (state & ReactiveNodeState.Invalid) !== 0 &&
    (state & ReactiveNodeState.Visited) !== 0
  ) {
    return true;
  }

  const context = getDefaultContext();

  // Check if this node has any dependencies to walk
  const firstIn = node.firstIn;
  if (firstIn === null) {
    // No dependencies at all: nothing could have changed.
    // Clear Invalid so the node is treated as stable until next write.
    node.state = state & ~ReactiveNodeState.Invalid;
    return false;
  }

  // Walk dependency tree to verify actual changes
  return shouldRecomputeLinear(node, firstIn, context);
}
