import { BitMask } from "../object/utils/bitwise";
import { CLEAN, COUNTER_CELLS_LENGTH } from "./process/graph.constants";

class GraphNode {
  _id: number = -1;

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
}

export { GraphNode };
