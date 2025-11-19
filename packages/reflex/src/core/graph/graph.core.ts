import {
  ASYNC,
} from "./utils/graph.constants.js";
import { GraphNode, IReactiveNode } from "./graph.types.js";

const isObserverNode = (node: IReactiveNode): boolean => {
  return typeof node._observer === "function";
};

const isAsyncNode = (node: IReactiveNode): boolean => {
  return (node._flags & ASYNC) !== 0;
};

/**
 * createReactiveNode: Factory function for creating graph vertices.
 *
 * Each node starts in a clean state with all fields initialized.
 * The node is ready to be used immediately (no async initialization).
 */
function createReactiveNode(): IReactiveNode {
  // New GraphNode() initializes all 18 fields in constructor.
  return new GraphNode();
}

export { isObserverNode, isAsyncNode, createReactiveNode, GraphNode };
