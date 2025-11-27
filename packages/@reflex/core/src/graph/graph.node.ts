import { BitMask } from "../object/utils/bitwise";
import { CLEAN, COUNTER_CELLS_LENGTH, DIRTY } from "./process/graph.constants";

class GraphNode {
  _firstSource: GraphNode | null = null;
  _lastSource: GraphNode | null = null;
  _nextSource: GraphNode | null = null;
  _prevSource: GraphNode | null = null;

  _firstObserver: GraphNode | null = null;
  _lastObserver: GraphNode | null = null;
  _nextObserver: GraphNode | null = null;
  _prevObserver: GraphNode | null = null;

  _sourceCount: number = 0;
  _observerCount: number = 0;

  _flags: BitMask = CLEAN;
  _counters: Uint32Array = new Uint32Array(COUNTER_CELLS_LENGTH);
}

export { GraphNode };
