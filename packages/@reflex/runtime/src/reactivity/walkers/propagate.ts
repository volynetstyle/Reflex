import runtime from "../context";
import type { ReactiveNode } from "../shape";
import {
  type ReactiveEdge,
  DIRTY_STATE,
  WALKER_STATE,
  ReactiveNodeState,
} from "../shape";

// Returns true if `edge` belongs to the confirmed "tracked prefix" of the
// consumer's incoming dependency list.
//
// Background: while a consumer is re-executing (Tracking=true), it rebuilds
// its dependency list left-to-right. depsTail is a cursor that marks how far
// the new prefix has been confirmed so far:
//
//   firstIn → [e1] → [e2] → depsTail → [e3] → [e4] → null
//                  tracked prefix ↑       stale suffix ↑
//
// Only edges in the tracked prefix may invalidate the consumer mid-execution.
// Invalidating a stale-suffix edge would mark the consumer dirty based on a
// dependency it may no longer even read — a false positive.
//
// Example — depsTail = e2, checking e1 (prefix):
//   Walk e1.prevIn → null without hitting depsTail → e1 is before depsTail → true.
//
// Example — depsTail = e2, checking e3 (stale suffix):
//   Walk e3.prevIn → e2 === depsTail → e3 is after depsTail → false.
function isTrackedPrefixEdge(
  edge: ReactiveEdge,
  depsTail: ReactiveEdge | null,
): boolean {
  if (depsTail === null) return false;
  if (edge === depsTail) return true;

  for (let cursor = edge.prevIn; cursor !== null; cursor = cursor.prevIn) {
    if (cursor === depsTail) return false;
  }

  return true;
}

// Dispatch a watcher's invalidation callback, collecting any thrown error
// without letting it interrupt the remaining watcher notifications.
//
// `thrown` is the first error seen so far (null = none yet).
// Returns the error to re-throw after all watchers have been notified.
//
// Example — two watchers, second one throws:
//   dispatchWatcherInvalidation(w1, null)  → null   (w1 ok)
//   dispatchWatcherInvalidation(w2, null)  → Error  (w2 threw, captured)
//   after loop: throw Error
function dispatchWatcherInvalidation(
  node: ReactiveNode,
  thrown: unknown,
): unknown {
  try {
    runtime.dispatchWatcherEvent(node);
  } catch (error) {
    return thrown ?? error;
  }

  return thrown;
}

// Promote a subscriber from Invalid → Changed if and only if it is currently
// in the Invalid state (and no other dirty bit is set).
//
// Used by propagateOnce to eagerly upgrade direct subscribers of a confirmed
// changed producer before they are pulled. Only Invalid nodes are candidates:
// nodes already Changed, Disposed, or in other dirty states are left alone.
//
// Returns true when the promotion happened (caller should notify watchers).
function promoteChangedSubscriber(node: ReactiveNode): boolean {
  const state = node.state;

  if ((state & DIRTY_STATE) !== ReactiveNodeState.Invalid) return false;

  node.state = (state & ~ReactiveNodeState.Invalid) | ReactiveNodeState.Changed;
  return true;
}

// Compute the exact state bitmask that should be written to `edge.to` (the
// subscriber) when its upstream dependency is being invalidated.
//
// Returns 0 to mean "do not touch this subscriber" — either it is already
// dirty, disposed, or the invalidation is not permitted under the current
// tracking rules.
//
// The decision tree (in order):
//
// 1. Already dirty or disposed → skip (0).
//    Touching an already-dirty node wastes work; Disposed nodes must never
//    be re-activated.
//
// 2. promoteImmediate=true AND subscriber is not actively tracking:
//    Write Changed (not just Invalid) so pull-side skips the dep walk.
//    Clear Visited first if the node is in a walker state (stale marker).
//
//    Example: a producer's direct subscriber in an idle effect:
//      state = Idle → nextState = Idle | Changed
//
// 3. subscriber is not in any walker state (clean idle node):
//    Fast path — just add Invalid.
//
//    Example: computed C is idle, dep A changed:
//      state = 0 → nextState = Invalid
//
// 4. subscriber is in a walker state but not actively tracking:
//    Clear stale Visited bits, then add Invalid.
//
//    Example: computed C was visited in a previous DFS pass (Visited set),
//    but is not currently re-executing:
//      state = Visited → nextState = (Visited cleared) | Invalid
//
// 5. subscriber IS actively tracking (Tracking=true):
//    Only allowed if `edge` is within the confirmed tracked prefix (see
//    isTrackedPrefixEdge). If so, set both Visited and Invalid — Visited
//    records that we hit an active dep during this push walk.
//
//    Example: computed C is mid-execution, depsTail=e2, edge=e1 (prefix):
//      state = Tracking | Visited? → nextState = state | Visited | Invalid
//    Example: edge=e3 (stale suffix) → return 0, do not invalidate.
function getInvalidatedSubscriberState(
  edge: ReactiveEdge,
  promoteImmediate: boolean,
): number {
  const sub = edge.to;
  const state = sub.state;

  if ((state & (DIRTY_STATE | ReactiveNodeState.Disposed)) !== 0) {
    return 0;
  }

  const isTracking = (state & ReactiveNodeState.Tracking) !== 0;
  const inWalker = (state & WALKER_STATE) !== 0;

  if (!inWalker) {
    return (
      state |
      (promoteImmediate && !isTracking
        ? ReactiveNodeState.Changed
        : ReactiveNodeState.Invalid)
    );
  }

  if (!isTracking) {
    const cleared = state & ~ReactiveNodeState.Visited;
    return (
      cleared |
      (promoteImmediate ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
    );
  }

  if (!isTrackedPrefixEdge(edge, sub.depsTail)) {
    return 0;
  }

  return state | ReactiveNodeState.Visited | ReactiveNodeState.Invalid;
}

// Shallow one-level push: promote all direct Invalid subscribers of `node`
// to Changed, and notify any watcher subscribers.
//
// Called when a computed node is confirmed changed and has multiple
// subscribers (fanout). This eagerly upgrades siblings so their pull-side
// shouldRecompute can skip re-examining `node`'s subtree.
//
// Only promotes nodes that are exactly Invalid (DIRTY_STATE === Invalid).
// Nodes already Changed or in other dirty states are left alone.
//
// Example — computed C has subscribers D (Invalid) and E (Changed):
//   D: promoteChangedSubscriber → true  → D.state = Changed (+ watcher notify if needed)
//   E: promoteChangedSubscriber → false → skipped
//
// Does NOT recurse into subscribers' own outgoing edges — that is propagate's job.
export function propagateOnce(node: ReactiveNode): void {
  let thrown: unknown = null;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    if (!promoteChangedSubscriber(sub)) continue;

    if ((sub.state & ReactiveNodeState.Watcher) !== 0) {
      thrown = dispatchWatcherInvalidation(sub, thrown);
    }
  }

  if (thrown !== null) throw thrown;
}

/**
 * Push-side non-recursive DFS over outgoing subscriber edges.
 * It starts in the cheapest mode possible:
 * mark one subscriber, keep walking a single chain if there is only one edge,
 * and escalate to sibling-resume DFS only when branching actually appears.
 *
 * Called when a signal or computed node changes value and must notify the
 * full downstream subscriber tree.
 *
 * Graph traversal mechanics:
 *
 *   `edge`        — the edge currently being processed
 *   `resume`      — next sibling edge to process after the current subtree
 *   `stack`       — saved (resume, promote) pairs for ancestor sibling chains
 *   `promote`     — whether to write Changed (not just Invalid) to the current sub
 *   `resumePromote` — promote value to restore when we pop back to a saved frame
 *
 * Example graph (A changed, B/C/D are subscribers):
 *
 *   A ──► B ──► D
 *   A ──► C
 *
 *   startEdge = A→B, resume = A→C
 *
 *   Iteration 1: edge=A→B  → mark B Invalid, B has child D
 *     push {edge: A→C, promote} onto stack
 *     edge=B→D, resume=null
 *
 *   Iteration 2: edge=B→D  → mark D Invalid, D has no children
 *     resume=null, pop stack → edge=A→C, resume=null
 *
 *   Iteration 3: edge=A→C  → mark C Invalid, C has no children
 *     resume=null, stack empty → break
 *
 * promoteImmediate=true is passed when the source is a confirmed-changed
 * producer and its direct subscribers should be upgraded to Changed immediately
 * (skipping the pull-side dep walk for them).
 *
 * Example — effect E depends on signal S (promoteImmediate=true):
 *   S.set(v) → propagate(S→E, promoteImmediate=true)
 *   getInvalidatedSubscriberState sees promoteImmediate && !Tracking
 *   → writes Changed to E → E's scheduler fires without a shouldRecompute call.
 *
 * Watcher nodes are leaves: they receive a notification callback but are
 * never descended into (they have no meaningful firstOut).
 *
 * Error handling: watcher callbacks may throw. All watchers are notified
 * before the first error is re-thrown (same pattern as propagateOnce).
 */
export function propagate(
  startEdge: ReactiveEdge,
  promoteImmediate = false,
): void {
  const stack: Array<{ edge: ReactiveEdge; promote: boolean }> = [];
  let stackTop = -1;
  let edge = startEdge;
  let resume: ReactiveEdge | null = startEdge.nextOut;
  let promote = promoteImmediate;
  let resumePromote = promoteImmediate;
  let thrown: unknown = null;

  while (true) {
    const sub = edge.to;
    const nextState = getInvalidatedSubscriberState(edge, promote);

    if (nextState !== 0) {
      sub.state = nextState;

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        // Watchers are terminal — notify but do not descend.
        thrown = dispatchWatcherInvalidation(sub, thrown);
      } else if (sub.firstOut !== null) {
        // sub has its own subscribers: descend, saving the current sibling
        // chain so we can resume it after the subtree is fully walked.
        if (resume !== null)
          stack[++stackTop] = { edge: resume, promote: resumePromote };

        edge = sub.firstOut;
        resume = edge.nextOut;
        // Children of sub are never directly promoted — only the root caller
        // decides promoteImmediate for the starting level.
        promote = resumePromote = false;
        continue;
      }
      // else: sub has no outgoing edges — it is a leaf, fall through to advance.
    }
    // nextState === 0: subscriber skipped (already dirty / disposed / stale suffix).

    // ── Advance to next edge ──────────────────────────────────────────────────
    //
    // Priority: resume sibling in current chain → pop saved frame from stack.
    //
    // Example (after processing B→D above):
    //   resume = null (D had no siblings) → pop stack → frame = {edge: A→C}
    //   edge = A→C, resume = A→C.nextOut (null here)
    if (resume !== null) {
      edge = resume;
      promote = resumePromote;
      resume = edge.nextOut;
    } else if (stackTop >= 0) {
      const frame = stack[stackTop--]!;
      edge = frame.edge;
      promote = resumePromote = frame.promote;
      resume = edge.nextOut;
    } else {
      break;
    }
  }

  if (thrown !== null) throw thrown;
}
