import { ReactiveNode } from "../..";
import { Traversal } from "../../runtime";
import { PackedClock } from "./methods/pack";

/**
 * Obsolete ⟺ никогда не вычислялся.
 * Соответствует старому ReactiveNodeState.Obsolete.
 */
export function isObsolete(node: ReactiveNode): boolean {
  return node.computedAt === 0;
}


const STALE_THIS_TRAVERSAL = -1; // sentinel: "проверяется, оказался stale"

/**
 * Транзитивная проверка с мемоизацией через verifiedAt.
 *
 * verifiedAt === Traversal.current     → уже проверен, чистый
 * verifiedAt === -Traversal.current    → уже проверен, грязный
 * иначе                                → не проверялся в этом traversal
 */
export function isStaleTransitive(node: ReactiveNode): boolean {
  if (!node.compute) return false;
  if (node.computedAt === 0) return true;

  const t = Traversal.current;
  
  // Мемоизированный результат этого traversal
  if (node.verifiedAt === t) return false;   // чистый
  if (node.verifiedAt === -t) return true;   // грязный

  for (let e = node.firstIn; e; e = e.nextIn) {
    const dep = e.from;

    if (PackedClock.version(dep.changedAt) > node.computedAt) {
      node.verifiedAt = -t; // грязный — мемоизируем
      return true;
    }

    if (isStaleTransitive(dep)) {
      node.verifiedAt = -t;
      return true;
    }
  }

  node.verifiedAt = t; // чистый — мемоизируем
  return false;
}

/**
 * Visited ⟺ уже посещён в текущем pull-обходе.
 * Заменяет флаг ReactiveNodeState.Visited.
 */
export function isVisited(node: ReactiveNode): boolean {
  return node.verifiedAt === Traversal.current;
}

export function markVisited(node: ReactiveNode): void {
  node.verifiedAt = Traversal.current;
}
