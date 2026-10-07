import { createStore as makeStore } from "@volynets/reflex-store";
const state = makeStore({ count: 1, nested: { value: 2 } });

export function runAliasDemo() {
  const before = state.count;
  state.count += state.nested.value;
  return { before, after: state.count };
}
