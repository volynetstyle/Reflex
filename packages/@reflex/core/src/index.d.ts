declare class GraphEdge {
  from: GraphNode;
  to: GraphNode;
  nextOut: GraphEdge | null;
  prevOut: GraphEdge | null;
  prevIn: GraphEdge | null;
  nextIn: GraphEdge | null;
  s: number;
}

declare class GraphNode {
  inCount: number;
  outCount: number;
  firstIn: GraphEdge | null;
  lastIn: GraphEdge | null;
  firstOut: GraphEdge | null;
  lastOut: GraphEdge | null;
}

declare interface NoneToVoidFn {
  (): void;
}

type ContextKeyType = string;

declare interface IOwnershipContextRecord {
  [key: ContextKeyType]: unknown;
}

declare class OwnershipNode {
  // -----------------------------
  // fixed layout fields
  // -----------------------------

  _parent: OwnershipNode | null; // invariant
  _firstChild: OwnershipNode | null; // invariant
  _lastChild: OwnershipNode | null; // optimization
  _nextSibling: OwnershipNode | null; // forward-list
  _prevSibling: OwnershipNode | null; // O(1) remove

  _context: IOwnershipContextRecord | null; // lazy
  _cleanups: NoneToVoidFn[] | null; // lazy

  _childCount: number;
  _flags: number;
}
