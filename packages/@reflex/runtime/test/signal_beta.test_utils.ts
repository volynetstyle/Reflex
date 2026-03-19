import { createRuntime } from "../src";
import type { ReactiveNode } from "../src/reactivity/shape";

export function setup() {
  const rt = createRuntime();

  const signal = <T>(initial: T) => {
    const s = rt.signal(initial);
    return [s, s.write, s] as const;
  };

  const computed = <T>(fn: () => T) => rt.computed(fn);

  return { signal, computed, effect: rt.effect, rt };
}

export function countIncoming(node: Pick<ReactiveNode, "firstIn">) {
  let count = 0;
  for (let edge = node.firstIn; edge; edge = edge.nextIn) {
    count++;
  }
  return count;
}

export function maxSourceEpoch(
  node: Pick<ReactiveNode, "firstIn">,
) {
  let max = 0;
  for (let edge = node.firstIn; edge; edge = edge.nextIn) {
    if (edge.from.t > max) {
      max = edge.from.t;
    }
  }
  return max;
}
