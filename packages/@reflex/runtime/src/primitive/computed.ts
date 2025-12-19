import { IOwnership, GraphNode } from "@reflex/core";

interface ComputedState<T> {
  value: T;
  dirty: boolean;
  computing: boolean;
  node: GraphNode;
  fn: () => T;
}

export function createComputed<T>(fn: () => T): IReactiveValue<T> {
  const { layout, graph, execStack } = RUNTIME;

  const id = layout.alloc();
  const node = graph.createNode(id);

  const state: ComputedState<T> = {
    value: undefined as any,
    dirty: true,
    computing: false,
    node,
    fn,
  };

  function read(): T {
    // ===== EXECUTION → GRAPH boundary =====
    execStack.enter(node.id);
    try {
      if (state.dirty) {
        recompute();
      }
      return state.value;
    } finally {
      execStack.leave(node.id);
    }
  }

  function recompute(): void {
    if (state.computing) {
      throw new Error("Cycle detected in computed");
    }

    state.computing = true;
    state.dirty = false;

    // clear old deps
    graph.clearIncoming(node);

    try {
      state.value = state.fn();
    } finally {
      state.computing = false;
    }
  }

  Object.defineProperty(read, "node", {
    value: node,
    enumerable: false,
  });

  return read as IReactiveValue<T>;
}
