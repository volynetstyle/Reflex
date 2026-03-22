import { computed, createRuntime, signal } from "../src";
import type { ReactiveNode } from "../src/reactivity/shape";

export function setup() {
  const rt = createRuntime();

  const makeSignal = <T>(initial: T) => {
    const s = signal(initial);
    return [s, (value: T) => s(value), s] as const;
  };

  const makeComputed = <T>(fn: () => T) => computed(fn);

  return { signal: makeSignal, computed: makeComputed, effect: rt.effect, rt };
}

export function countIncoming(node: Pick<ReactiveNode, "firstIn">) {
  let count = 0;
  for (let edge = node.firstIn; edge; edge = edge.nextIn) {
    count++;
  }
  return count;
}
