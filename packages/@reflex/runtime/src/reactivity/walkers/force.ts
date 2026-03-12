import recompute from "../consumer/recompute";
import {
  CLEAR_INVALID,
  INVALID,
  ReactiveNode,
  ReactiveNodeKind,
  ReactiveNodeState,
} from "../shape";
import { applyCutoff } from "./cutoff";

export function force<T>(node: ReactiveNode<T>) {
  const s = node.runtime;

  if (!(s & INVALID)) {
    return node.payload;
  }

  // 2. Брудний — треба розібратись
  if (s & ReactiveNodeState.Obsolete) {
    recompute(node);
    return node.payload;
  }

  // 3. Suspicious — ключовий стан Adapton
  // "можливо брудний, але перевір спочатку залежності"
  if (s & ReactiveNodeState.Invalid) {
    return checkAndMaybeRecompute(node);
  }
}

function checkAndMaybeRecompute<T>(node: ReactiveNode<T>): T {
  // Перевіряємо кожну залежність по черзі
  for (let edge = node.firstIn; edge; edge = edge.nextIn) {
    const dep = edge.to;

    if (dep.v === edge.observedVersion) {
      continue; // точно не змінилось, O(1)
    }

    const currentValue = force(dep);

    if (!applyCutoff(dep.payload, currentValue)) {
      recompute(node);
      return dep.payload;
    }

    edge.observedVersion = dep.v;
  }

  node.runtime &= CLEAR_INVALID;
  return node.payload!;
}

function markDirtyBatch(roots: ReactiveNode[]): void {
  let frontier = roots;
  while (frontier.length > 0) {
    const next: ReactiveNode[] = [];
    for (const node of frontier) {
      if (node.dirty) continue; // уже достигнут через другой путь
      node.dirty = true;
      if (node.compute && !node.inQueue) {
        node.inQueue = true;
        dirtyQueue.push(node); // O(1) radix heap insert
      }
      for (const obs of node.observers) if (!obs.dirty) next.push(obs);
    }
    frontier = next;
  }
}
