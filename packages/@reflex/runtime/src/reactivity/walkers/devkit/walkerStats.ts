
export interface TraversalStats {
  recuperateCalls: number;
  recuperateNodes: number;
  propagateCalls: number;
  propagateNodes: number;
}

export const stats: TraversalStats = {
  recuperateCalls: 0,
  recuperateNodes: 0,
  propagateCalls: 0,
  propagateNodes: 0,
};

export function resetStats() {
  stats.recuperateCalls = 0;
  stats.recuperateNodes = 0;
  stats.propagateCalls = 0;
  stats.propagateNodes = 0;
}