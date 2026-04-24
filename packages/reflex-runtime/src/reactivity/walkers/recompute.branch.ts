// ─── shouldRecomputeWalk ──────────────────────────────────────────────────────
//
// Pull walker for dirty consumers.
// Pure incoming chains use a small linear fast path; branching graphs fall back
// to the unified DFS walker. Both paths share the same allocation-free stack.
//
// try/finally removed intentionally:
//   - JSC and SpiderMonkey refuse to inline functions containing try/finally.
//   - TurboFan creates a separate deopt frame for the finally block even when
//     the path is exception-free, adding hidden overhead.
//   - Instead, every return site restores the shared stack high-water mark. This is
//     safe because these pull walkers own the slice [stackBase, stackTop) and
//     every exit path restores it before returning.
//
// Refresh can execute user compute functions. The hot walker stays outside
// try/catch; the refresh helper restores stack ownership on the throwing path.

import type { ReactiveNode, ReactiveEdge } from "../shape";
import { Changed, Invalid } from "../shape";
import { refreshAndPropagateIfNeeded } from "./recompute.refresh";

// Shared stack — reused across calls to avoid allocation.
// stackBase tracks the logical bottom per call so recursive entries
// don't trample each other's frames.
const shouldRecomputeStack: ReactiveEdge[] = new Array(2048).fill(undefined);
let shouldRecomputeStackHigh = 0;
const LINEAR_CLEAN = 0;
const LINEAR_CHANGED = 1;
const LINEAR_BAIL = 2;

function refreshFromShouldRecompute(
  node: ReactiveNode,
  fanout: boolean,
  stackBase: number,
): boolean {
  try {
    return refreshAndPropagateIfNeeded(node, fanout);
  } catch (error) {
    shouldRecomputeStackHigh = stackBase;
    throw error;
  }
}

function tryShouldRecomputeLinearChain(
  consumer: ReactiveNode,
  link: ReactiveEdge,
): number {
  const stack = shouldRecomputeStack;
  const stackBase = shouldRecomputeStackHigh;
  let stackTop = stackBase;
  let changed = false;

  while (true) {
    if (consumer.state & Changed) {
      changed = true;
      break;
    }

    const dep = link.from;
    const depState = dep.state;

    if (depState & Changed) {
      changed = refreshFromShouldRecompute(
        dep,
        link.prevOut !== null || link.nextOut !== null,
        stackBase,
      );
      break;
    }

    if (depState & Invalid) {
      const deps = dep.firstIn;

      if (deps !== null) {
        if (deps.nextIn !== null) {
          shouldRecomputeStackHigh = stackBase;
          return LINEAR_BAIL;
        }

        stack[stackTop++] = link;
        shouldRecomputeStackHigh = stackTop;
        link = deps;
        consumer = dep;
        continue;
      }

      changed = refreshFromShouldRecompute(
        dep,
        link.prevOut !== null || link.nextOut !== null,
        stackBase,
      );
      break;
    }

    if (link.nextIn !== null) {
      shouldRecomputeStackHigh = stackBase;
      return LINEAR_BAIL;
    }

    consumer.state &= ~Invalid;

    while (stackTop > stackBase) {
      const parentLink = stack[--stackTop]!;
      consumer = parentLink.to;
      consumer.state &= ~Invalid;
    }

    shouldRecomputeStackHigh = stackBase;
    return LINEAR_CLEAN;
  }

  if (!changed) {
    consumer.state &= ~Invalid;

    while (stackTop > stackBase) {
      consumer = stack[--stackTop]!.to;
      consumer.state &= ~Invalid;
    }

    shouldRecomputeStackHigh = stackBase;
    return LINEAR_CLEAN;
  }

  while (stackTop > stackBase) {
    const parentLink = stack[--stackTop]!;

    changed = refreshFromShouldRecompute(
      consumer,
      parentLink.prevOut !== null || parentLink.nextOut !== null,
      stackBase,
    );
    consumer = parentLink.to;

    if (!changed) {
      consumer.state &= ~Invalid;

      while (stackTop > stackBase) {
        consumer = stack[--stackTop]!.to;
        consumer.state &= ~Invalid;
      }

      shouldRecomputeStackHigh = stackBase;
      return LINEAR_CLEAN;
    }
  }

  shouldRecomputeStackHigh = stackBase;
  return LINEAR_CHANGED;
}

export function shouldRecomputeWalk(
  consumer: ReactiveNode,
  link: ReactiveEdge,
): boolean {
  if (link.nextIn === null) {
    const changed = tryShouldRecomputeLinearChain(consumer, link);
    if (changed !== LINEAR_BAIL) return changed === LINEAR_CHANGED;
  }

  return shouldRecomputeBranchingWalk(consumer, link);
}

function shouldRecomputeBranchingWalk(
  consumer: ReactiveNode,
  link: ReactiveEdge,
): boolean {
  const stack = shouldRecomputeStack;
  const stackBase = shouldRecomputeStackHigh;
  let stackTop = stackBase;
  let changed = false;

  outer: do {
    while (true) {
      if (consumer.state & Changed) {
        changed = true;
        break;
      }

      const dep = link.from;
      const depState = dep.state;

      if (depState & Changed) {
        changed = refreshFromShouldRecompute(
          dep,
          link.prevOut !== null || link.nextOut !== null,
          stackBase,
        );
        break;
      }

      if (depState & Invalid) {
        const deps = dep.firstIn;

        if (deps !== null) {
          stack[stackTop++] = link;
          shouldRecomputeStackHigh = stackTop;
          link = deps;
          consumer = dep;
          if (deps.nextIn === null) continue;
          continue outer;
        }

        changed = refreshFromShouldRecompute(
          dep,
          link.prevOut !== null || link.nextOut !== null,
          stackBase,
        );
        break;
      }

      const next = link.nextIn;
      if (next !== null) {
        link = next;
        continue outer;
      }

      consumer.state &= ~Invalid;

      if (stackTop === stackBase) {
        shouldRecomputeStackHigh = stackBase;
        return false;
      }

      const parentLink = stack[--stackTop]!;
      consumer = parentLink.to;

      const parentNext = parentLink.nextIn;
      if (parentNext !== null) {
        link = parentNext;
        continue outer;
      }
    }

    if (!changed) {
      const next = link.nextIn;
      if (next !== null) {
        link = next;
        continue;
      }
      consumer.state &= ~Invalid;
    }

    while (stackTop > stackBase) {
      const parentLink = stack[--stackTop]!;

      if (changed) {
        changed = refreshFromShouldRecompute(
          consumer,
          parentLink.prevOut !== null || parentLink.nextOut !== null,
          stackBase,
        );
      } else {
        const next = parentLink.nextIn;
        if (next !== null) {
          link = next;
          continue outer;
        }
        consumer.state &= ~Invalid;
      }

      consumer = parentLink.to;
    }

    shouldRecomputeStackHigh = stackBase;
    return changed;
  } while (true);
}
