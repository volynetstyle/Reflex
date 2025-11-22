import { BitMask } from "../object/utils/bitwise";
import {
  CLEAN,
  COUNTER_CELLS_LENGTH,
  ASYNC_CELLS_LENGTH,
} from "./utils/graph.constants";

class Link {
  source: GraphNode;
  observer: GraphNode;

  nextInSource: Link | null = null;
  prevInSource: Link | null = null;

  nextInObserver: Link | null = null;
  prevInObserver: Link | null = null;

  constructor(source: GraphNode, observer: GraphNode) {
    this.source = source;
    this.observer = observer;
  }
}


class GraphNode {
  _firstSource: Link | null = null;
  _lastSource: Link | null = null;

  _firstObserver: Link | null = null;
  _lastObserver: Link | null = null;

  _sourceCount = 0;
  _observerCount = 0;

  _flags: BitMask = CLEAN;
  _counters: Uint32Array = new Uint32Array(COUNTER_CELLS_LENGTH);
  _async: Uint32Array = new Uint32Array(ASYNC_CELLS_LENGTH);
}

export { GraphNode, Link };
