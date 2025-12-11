import { BitMask } from "../object/utils/bitwise";
import { CLEAN } from "./process/graph.constants";

class GraphEdge {
  from: GraphNode;
  to: GraphNode;

  prevOut: GraphEdge | null = null;
  nextOut: GraphEdge | null = null;

  prevIn: GraphEdge | null = null;
  nextIn: GraphEdge | null = null;

  constructor(from: GraphNode, to: GraphNode) {
    this.from = from;
    this.to = to;
  }
}

class GraphNode {
  id: number = -1;

  firstOut: GraphEdge | null = null;
  lastOut: GraphEdge | null = null;

  firstIn: GraphEdge | null = null;
  lastIn: GraphEdge | null = null;

  outCount: number = 0;
  inCount: number = 0;

  flags: BitMask = CLEAN;
}

export { GraphNode, GraphEdge };
