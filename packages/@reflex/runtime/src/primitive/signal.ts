import { IOwnership, GraphNode } from "@reflex/core";
import { Accessor, Setter, Signal } from "./types";

interface SignalState<T> {
  value: T;
  node: GraphNode;
  owner: IOwnership | null;
}

/**
 * SIGNAL DESIGN INVARIANT
 *
 * - A signal owns a graph node.
 * - Graph manages causality.
 * - Signal manages value.
 * - API objects are lightweight façades over runtime state.
 */
export function signal<T>(initial: T): Signal<T> {
  const { layout, graph, getCurrentOwner } = RUNTIME;

  // allocate graph node
  const id = layout.alloc();
  const node = graph.createNode(id);

  const state: SignalState<T> = {
    value: initial,
    node,
    owner: null,
  };

  // write function compatible with Setter<T>
  const write: Setter<T> = <U extends T>(value: U | ((prev: T) => U)) => {
    const next =
      typeof value === "function"
        ? (value as (prev: T) => U)(state.value)
        : value;

    if (!Object.is(state.value, next)) {
      state.value = next;
      graph.markDirty(node);
    }

    return next;
  };

  const read = (() => state.value) as unknown as Accessor<T>;
  read.set = write;

  if ((state.owner = getCurrentOwner())) {
    state.owner.onScopeCleanup(() => {
      graph.disposeNode(node);
    });
  }

  return [read, write];
}

// // possible uses

const [index, setValue] = signal<unknown>(undefined);

// index.value++;
// index.value += 1;
// index.value = ++index.value;
// index.value = index.value + 1;

// index.set(1);
// index.set((prev) => prev + 1);

setValue({ name: "Ivan", stats: [10, 20] });
// setValue((prev) => prev + 1);

const i = () => {

}