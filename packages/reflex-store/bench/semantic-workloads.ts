import { computed, createRuntime, effect, signal } from "@volynets/reflex";
import { createKeyedProjection, createSelector } from "../src";

export type Strategy = "identity" | "deep" | "projection";

export interface WorkloadMetrics {
  sourceWrites: number;
  producerRecomputes: number;
  consumerExecutions: number;
  equalityCalls: number;
  equalityFieldsVisited: number;
  equivalentOutputs: number;
  semanticallyAffectedNodes: number;
  checksum: number;
}

export interface Workload {
  readonly metrics: WorkloadMetrics;
  update(equivalent: boolean): void;
  dispose(): void;
}

function deepEqualRecord(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
  metrics: WorkloadMetrics,
): boolean {
  metrics.equalityCalls++;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (let index = 0; index < keys.length; index++) {
    metrics.equalityFieldsVisited++;
    const key = keys[index]!;
    if (!Object.is(left[key], right[key])) return false;
  }
  metrics.equivalentOutputs++;
  return true;
}

function burn(iterations: number, seed: number): number {
  let value = seed | 0;
  for (let index = 0; index < iterations; index++) {
    value = Math.imul(value ^ index, 1_664_525) + 1_013_904_223;
  }
  return value | 0;
}

export function createEquivalentCascade(options: {
  strategy: Strategy;
  fields: number;
  consumers: number;
  downstreamIterations?: number;
}): Workload {
  const runtime = createRuntime({ effectStrategy: "flush" });
  const source = signal(0);
  const metrics: WorkloadMetrics = {
    sourceWrites: 0,
    producerRecomputes: 0,
    consumerExecutions: 0,
    equalityCalls: 0,
    equalityFieldsVisited: 0,
    equivalentOutputs: 0,
    semanticallyAffectedNodes: 0,
    checksum: 0,
  };
  const makeValue = () => {
    metrics.producerRecomputes++;
    const parity = source() & 1;
    const value: Record<string, number> = { parity };
    for (let index = 1; index < options.fields; index++) value[`f${index}`] = index;
    return value;
  };

  let read: () => number;
  if (options.strategy === "identity") {
    const value = computed(makeValue);
    read = () => value().parity!;
  } else if (options.strategy === "deep") {
    const value = createKeyedProjection(
      makeValue,
      () => 0,
      (next) => next,
      { equals: (left, right) => deepEqualRecord(left, right, metrics) },
    );
    read = () => value(0)!.parity!;
  } else {
    const value = createKeyedProjection(makeValue, () => 0, (next) => next.parity);
    read = () => value(0)!;
  }

  const stops = Array.from({ length: options.consumers }, () =>
    effect(() => {
      metrics.consumerExecutions++;
      metrics.checksum ^= burn(options.downstreamIterations ?? 0, read());
    }),
  );
  metrics.consumerExecutions = 0;
  metrics.producerRecomputes = 0;

  return {
    metrics,
    update(equivalent) {
      metrics.sourceWrites++;
      metrics.semanticallyAffectedNodes += equivalent ? 0 : options.consumers;
      const previous = source();
      source.set(previous + (equivalent ? 2 : 1));
      runtime.flush();
    },
    dispose() {
      stops.forEach((stop) => stop());
    },
  };
}

export function createKeyedLocality(options: {
  keys: number;
  consumersPerKey: number;
  selector: boolean;
}): Workload {
  const runtime = createRuntime({ effectStrategy: "flush" });
  const selected = signal(0);
  const metrics: WorkloadMetrics = {
    sourceWrites: 0,
    producerRecomputes: 0,
    consumerExecutions: 0,
    equalityCalls: 0,
    equalityFieldsVisited: 0,
    equivalentOutputs: 0,
    semanticallyAffectedNodes: 0,
    checksum: 0,
  };
  const isSelected = options.selector
    ? createSelector(selected)
    : (key: number) => {
        metrics.producerRecomputes++;
        return selected() === key;
      };
  const stops = Array.from(
    { length: options.keys * options.consumersPerKey },
    (_, index) => {
      const key = Math.floor(index / options.consumersPerKey);
      return effect(() => {
        metrics.consumerExecutions++;
        metrics.checksum += isSelected(key) ? 1 : 0;
      });
    },
  );
  metrics.consumerExecutions = 0;
  metrics.producerRecomputes = 0;
  let next = 1;

  return {
    metrics,
    update() {
      metrics.sourceWrites++;
      metrics.semanticallyAffectedNodes += options.consumersPerKey * 2;
      selected.set(next);
      next = (next + 1) % options.keys;
      runtime.flush();
    },
    dispose() {
      stops.forEach((stop) => stop());
    },
  };
}

export function createDynamicChurn(options: {
  strategy: Strategy;
  consumers: number;
}): Workload {
  const runtime = createRuntime({ effectStrategy: "flush" });
  const branch = signal(false);
  const left = signal(0);
  const right = signal(0);
  const metrics: WorkloadMetrics = {
    sourceWrites: 0,
    producerRecomputes: 0,
    consumerExecutions: 0,
    equalityCalls: 0,
    equalityFieldsVisited: 0,
    equivalentOutputs: 0,
    semanticallyAffectedNodes: 0,
    checksum: 0,
  };
  const derive = () => {
    metrics.producerRecomputes++;
    return { value: branch() ? right() : left() };
  };
  let read: () => number;
  if (options.strategy === "identity") {
    const value = computed(derive);
    read = () => value().value;
  } else if (options.strategy === "deep") {
    const value = createKeyedProjection(derive, () => 0, (next) => next, {
      equals: (a, b) => deepEqualRecord(a, b, metrics),
    });
    read = () => value(0)!.value;
  } else {
    const value = createKeyedProjection(derive, () => 0, (next) => next.value);
    read = () => value(0)!;
  }
  const stops = Array.from({ length: options.consumers }, () =>
    effect(() => {
      metrics.consumerExecutions++;
      metrics.checksum ^= read();
    }),
  );
  metrics.consumerExecutions = 0;
  metrics.producerRecomputes = 0;

  return {
    metrics,
    update(churn) {
      metrics.sourceWrites++;
      metrics.semanticallyAffectedNodes += options.consumers;
      if (churn) branch.set(!branch());
      const active = branch() ? right : left;
      active.set(active() + 1);
      runtime.flush();
    },
    dispose() {
      stops.forEach((stop) => stop());
    },
  };
}

export function executionAmplification(metrics: WorkloadMetrics): number {
  return metrics.semanticallyAffectedNodes === 0
    ? metrics.consumerExecutions
    : metrics.consumerExecutions / metrics.semanticallyAffectedNodes;
}
