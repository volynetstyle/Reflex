import { createRuntime } from "../src";
import type { ReactiveNode } from "../src/core";

export function setup() {
  const rt = createRuntime();

  const signal = <T>(initial: T) => {
    const s = rt.signal(initial);
    return [s.read.bind(s), s.write.bind(s), s] as const;
  };

  const computed = <T>(fn: () => T) => rt.computed(fn);

  return { signal, computed, effect: rt.effect, rt };
}

export function countIncoming(node: Pick<ReactiveNode, "incoming">) {
  return node.incoming.length;
}

export function maxSourceEpoch(
  node: Pick<ReactiveNode, "incoming">,
) {
  let max = 0;
  for (let i = 0; i < node.incoming.length; ++i) {
    const edge = node.incoming[i]!;
    if (edge.from.t > max) {
      max = edge.from.t;
    }
  }
  return max;
}
