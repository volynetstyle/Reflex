import {
  ASYNC,
  CLEAN,
  ASYNC_CELLS_LENGTH,
  COUNTER_CELLS_LENGTH,
} from "./graph.constants.js";
import { GraphProto } from "./graph.proto.js";
import { IReactiveNode } from "./graph.types.js";

const isObserverNode = (node: IReactiveNode): boolean => {
  return typeof node._observer === "function";
};

const isAsyncNode = (node: IReactiveNode): boolean => {
  return (node._flags & ASYNC) !== 0;
};

function createReactiveNode(): IReactiveNode {
  const graphNode = Object.create(GraphProto) as IReactiveNode &
    typeof GraphProto;

  graphNode._valueRaw = null;
  graphNode._sources = null;
  graphNode._observers = null;
  graphNode._observer = null;
  graphNode._counters = new Uint32Array(COUNTER_CELLS_LENGTH); // [epoch, version, uversion]
  graphNode._async = new Uint32Array(ASYNC_CELLS_LENGTH);
  graphNode._flags = CLEAN;
  graphNode._kind = "source";

  return graphNode;
}

export { isObserverNode, isAsyncNode, createReactiveNode };
