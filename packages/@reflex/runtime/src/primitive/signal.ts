import { IOwnership, GraphNode } from "@reflex/core";
import { IReactiveValue } from "./types";

interface SignalState<T> {
  value: T;
  node: GraphNode;
  owner: IOwnership | null;
}

/**
 * SIGNAL DESIGN INVARIANT
 *
 * A signal is not a graph node.
 * A signal owns a graph node.
 *
 * Graph manages causality.
 * Signal manages value.
 *
 * API objects are lightweight façades over runtime state.
 */
export function createSignal<T>(initial: T): IReactiveValue<T> {
  const { layout, graph } = RUNTIME;

  // allocate graph node
  const id = layout.alloc();
  const node = graph.createNode(id);

  const state: SignalState<T> = {
    value: initial,
    node,
    owner: null,
  };

  function read(): T {
    // execution-stack / dependency tracking hook here
    return state.value;
  }

  read.set = (next: T): void => {
    if (Object.is(state.value, next)) return;

    state.value = next;

    // notify graph / scheduler here
    // graph.markDirty(node)
  };

  Object.defineProperty(read, "node", {
    value: node,
    enumerable: false,
    writable: false,
  });

  // ownership / cleanup
  const owner = getCurrentOwner?.();  
  if (owner) {
    state.owner = owner;
    owner.onScopeCleanup(() => {
      // unlink graph node, clear edges
      graph.disposeNode(node);
    });
  }

  return read as IReactiveValue<T>;
}
