import { MIN_RANK, MAX_RANK_VALUE } from "../bucket.constants";
import { RankNode } from "../bucket.queue";

/**
 * Валидация ранга перед операцией
 */
export function validateRank(rank: unknown): boolean {
  if (typeof rank !== "number") return false;
  if (!Number.isInteger(rank)) return false;
  if (Number.isNaN(rank)) return false;
  if (rank < MIN_RANK || rank > MAX_RANK_VALUE) return false;
  return true;
}

/**
 * Валидация узла перед операцией
 */
export function validateNode(node: unknown): node is Node {
  if (node === null || typeof node !== "object") return false;

  const n = node as Partial<RankNode<unknown>>;

  if (typeof n.rank !== "number") return false;

  if (!("nextPeer" in n) || !("prevPeer" in n)) return false;

  return true;
}
