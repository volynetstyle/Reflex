import { beforeEach, describe, expect, it } from "vitest";
import {
  createExecutionDomain,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
  type ExecutionDomain,
  type ReactiveNode,
} from "../../runtime.test_utils";
import {
  createConsumer,
  createProducer,
  createWatcher,
  resetRuntime,
} from "../../runtime.test_utils";

/**
 * Observational equivalence (docs/architecture/observational-equivalence.md):
 * for random graphs and random valid interleavings with another domain, the
 * projected trace of domain A equals the trace of running A alone.
 */

function prng(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

type Op =
  | { kind: "write"; producer: number; value: number }
  | { kind: "batch"; writes: Array<[number, number]> }
  | { kind: "read"; consumer: number }
  | { kind: "flush" }
  | { kind: "throw" };

interface GraphSpec {
  producers: number;
  consumers: Array<{ deps: number[]; dynamic: boolean; fails: boolean }>;
  watchers: number[][];
}

function generateSpec(random: () => number): GraphSpec {
  const producers = 2 + Math.floor(random() * 3);
  const consumers: GraphSpec["consumers"] = [];
  for (let i = 0; i < 5; i++) {
    const available = producers + i;
    const count = 1 + Math.floor(random() * Math.min(3, available));
    const deps = Array.from({ length: count }, () =>
      Math.floor(random() * available),
    );
    consumers.push({ deps, dynamic: random() < 0.4, fails: random() < 0.15 });
  }
  const watchers = Array.from({ length: 2 }, () =>
    Array.from({ length: 1 + Math.floor(random() * 2) }, () =>
      Math.floor(random() * (producers + consumers.length)),
    ),
  );
  return { producers, consumers, watchers };
}

function generateOps(random: () => number, spec: GraphSpec, length: number) {
  const ops: Op[] = [];
  for (let i = 0; i < length; i++) {
    const roll = random();
    const producer = Math.floor(random() * spec.producers);
    const value = Math.floor(random() * 4);
    if (roll < 0.35) ops.push({ kind: "write", producer, value });
    else if (roll < 0.5)
      ops.push({
        kind: "batch",
        writes: [
          [producer, value],
          [Math.floor(random() * spec.producers), Math.floor(random() * 4)],
        ],
      });
    else if (roll < 0.75)
      ops.push({
        kind: "read",
        consumer: Math.floor(random() * spec.consumers.length),
      });
    else if (roll < 0.95) ops.push({ kind: "flush" });
    else ops.push({ kind: "throw" });
  }
  return ops;
}

interface Instance {
  domain: ExecutionDomain;
  trace: string[];
  apply(op: Op): void;
}

function instantiate(spec: GraphSpec, tag: string): Instance {
  const trace: string[] = [];
  const queue: ReactiveNode[] = [];
  const domain = createExecutionDomain({
    scheduler: {
      onNodeInvalidated: (node) => {
        trace.push(`enqueue:${watcherIds.get(node)}`);
        queue.push(node);
      },
      onRuntimeIdle: () => void trace.push("idle"),
      flush: () => {
        while (queue.length !== 0) runWatcher(queue.shift()!);
      },
    },
  });
  const watcherIds = new Map<ReactiveNode, number>();
  const nodes: ReactiveNode[] = [];

  domain.run(() => {
    for (let i = 0; i < spec.producers; i++) nodes.push(createProducer(0));
    spec.consumers.forEach((consumer, index) => {
      const id = spec.producers + index;
      nodes.push(
        createConsumer(() => {
          trace.push(`compute:${id}`);
          let sum = 0;
          const deps =
            consumer.dynamic && readProducer(nodes[0]!) % 2 === 1
              ? [...consumer.deps].reverse()
              : consumer.deps;
          for (const dep of deps) {
            const node = nodes[dep]!;
            sum +=
              dep < spec.producers ? readProducer(node) : readConsumer(node);
          }
          if (consumer.fails && sum % 3 === 2) throw new Error(`fail:${id}`);
          return sum;
        }),
      );
    });
    spec.watchers.forEach((deps, index) => {
      const watcher = createWatcher(() => {
        const values = deps.map((dep) => {
          const node = nodes[dep]!;
          try {
            return dep < spec.producers
              ? readProducer(node)
              : readConsumer(node);
          } catch {
            return "err";
          }
        });
        trace.push(`watch:${index}:${values.join(",")}`);
      });
      watcherIds.set(watcher, index);
      runWatcher(watcher);
    });
  });

  const guarded = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      trace.push(`throw:${(error as Error).message}`);
    }
  };

  return {
    domain,
    trace,
    apply(op) {
      switch (op.kind) {
        case "write":
          guarded(() =>
            domain.run(() => writeProducer(nodes[op.producer]!, op.value)),
          );
          return;
        case "batch":
          guarded(() =>
            domain.batch(() => {
              for (const [producer, value] of op.writes)
                writeProducer(nodes[producer]!, value);
            }),
          );
          return;
        case "read":
          guarded(() =>
            trace.push(
              `read:${op.consumer}=${domain.run(() =>
                readConsumer(nodes[spec.producers + op.consumer]!),
              )}`,
            ),
          );
          return;
        case "flush":
          guarded(() => domain.flush());
          return;
        case "throw":
          guarded(() =>
            domain.run(() => {
              throw new Error(`${tag}:explicit`);
            }),
          );
      }
    },
  };
}

describe("Execution domains - observational equivalence", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("projects A's trace unchanged under random interleavings with B", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const random = prng(seed);
      const specA = generateSpec(random);
      const specB = generateSpec(random);
      const opsA = generateOps(random, specA, 40);
      const opsB = generateOps(random, specB, 40);

      const alone = instantiate(specA, "a");
      for (const op of opsA) alone.apply(op);

      const a = instantiate(specA, "a");
      const b = instantiate(specB, "b");
      let ia = 0;
      let ib = 0;
      while (ia < opsA.length || ib < opsB.length) {
        const pick = random();
        if (ia < opsA.length && (ib >= opsB.length || pick < 0.5)) {
          const op = opsA[ia++]!;
          // Sometimes enter A from inside B's managed execution.
          if (pick < 0.15) b.domain.run(() => a.apply(op));
          else a.apply(op);
        } else {
          const op = opsB[ib++]!;
          if (pick > 0.85) a.domain.run(() => b.apply(op));
          else b.apply(op);
        }
      }

      expect(a.trace, `seed ${seed}`).toEqual(alone.trace);
    }
  });
});
