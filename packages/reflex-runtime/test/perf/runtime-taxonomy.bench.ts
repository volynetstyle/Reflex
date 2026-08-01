import { afterAll, beforeAll, bench, describe } from "vitest";
import {
  createConsumer,
  createProducer,
  createWatcher,
  configureRuntimeContext,
  disposeWatcher,
  enterPropagationScope,
  leavePropagationScope,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
  writeProducer,
  type ReactiveNode,
  type RuntimeHooks,
} from "../runtime.test_utils";

function setInternalHooks(
  onNodeInvalidated: RuntimeHooks["onNodeInvalidated"] = undefined,
  onRuntimeIdle: RuntimeHooks["onRuntimeIdle"] = undefined,
): void {
  configureRuntimeContext({
    hooks: { onNodeInvalidated, onRuntimeIdle },
  });
}

const WARMUP_ITERATIONS = 100;
const ITERATIONS = 1_000;

let blackholeValue = 0;

function blackhole(value: number): void {
  blackholeValue ^= value | 0;
}

type Pressure =
  | "harness"
  | "propagation"
  | "stabilization"
  | "tracking"
  | "scheduler"
  | "selectivity";

type Topology =
  | "baseline"
  | "linear"
  | "diamond"
  | "wideFanout"
  | "wideFanin"
  | "layered"
  | "denseLayered"
  | "dynamicBranch"
  | "deepDynamic"
  | "disposeChurn"
  | "selector"
  | "effectLeaves"
  | "broadPropagation";

type Workload =
  | "empty"
  | "writeReadOne"
  | "writeReadAll"
  | "manyWritesReadOnce"
  | "effectFlush"
  | "hotRead"
  | "dynamicChurn"
  | "lifecycleChurn"
  | "partialReads"
  | "updateOneKey"
  | "batchedWritesReadTail";

type ScenarioConfig = {
  pressure: Pressure;
  topology: Topology;
  workload: Workload;
  size: "small" | "medium";
  label: string;
  modeledWork: WorkModel;
  nodes: number;
  sources: number;
  sinks: number;
  depth?: number;
  width?: number;
  fanout?: number;
  fanin?: number;
  layers?: number;
  readRatio?: number;
  updateRatio?: number;
  dynamicRatio?: number;
  batchSize?: number;
};

type WorkModel = {
  writes: number;
  sinkReads: number;
  producerReads: number;
  consumerReads: number;
  computeRuns: number;
  recomputeCandidates: number;
  invalidated: number;
  edgeTraversals: number;
  scheduledWatchers: number;
  flushes: number;
  depsAdded: number;
  depsDropped: number;
  watchersCreated: number;
  watchersDisposed: number;
};

type BenchCase = {
  step(iteration: number): number;
  verify?(checksum: number): void;
  dispose?(): void;
};

type Scenario = ScenarioConfig & {
  create(): BenchCase;
};

type LayeredGraph = {
  sources: ReactiveNode<number>[];
  sinks: ReactiveNode<number>[];
};

let printedLegend = false;

function workModel({
  writes = 0,
  sinkReads = 0,
  producerReads = 0,
  consumerReads = 0,
  computeRuns = 0,
  recomputeCandidates = 0,
  invalidated = 0,
  edgeTraversals = 0,
  scheduledWatchers = 0,
  flushes = 0,
  depsAdded = 0,
  depsDropped = 0,
  watchersCreated = 0,
  watchersDisposed = 0,
}: Partial<WorkModel>): WorkModel {
  return {
    writes,
    sinkReads,
    producerReads,
    consumerReads,
    computeRuns,
    recomputeCandidates,
    invalidated,
    edgeTraversals,
    scheduledWatchers,
    flushes,
    depsAdded,
    depsDropped,
    watchersCreated,
    watchersDisposed,
  };
}

function pushMetric(
  parts: string[],
  name: string,
  value: number | undefined,
): void {
  if (value !== undefined && value !== 0) {
    parts.push(`${name}=${value}`);
  }
}

function formatParams(scenario: Scenario): string {
  const parts: string[] = [];

  pushMetric(parts, "nodes", scenario.nodes);
  pushMetric(parts, "src", scenario.sources);
  pushMetric(parts, "sink", scenario.sinks);
  pushMetric(parts, "depth", scenario.depth);
  pushMetric(parts, "width", scenario.width);
  pushMetric(parts, "fanout", scenario.fanout);
  pushMetric(parts, "fanin", scenario.fanin);
  pushMetric(parts, "layers", scenario.layers);
  pushMetric(parts, "batch", scenario.batchSize);

  if (scenario.readRatio !== undefined) {
    parts.push(`read=${Math.round(scenario.readRatio * 1000) / 10}%`);
  }
  if (scenario.updateRatio !== undefined) {
    parts.push(`update=${Math.round(scenario.updateRatio * 1000) / 10}%`);
  }
  if (scenario.dynamicRatio !== undefined) {
    parts.push(`dynamic=${Math.round(scenario.dynamicRatio * 1000) / 10}%`);
  }

  return parts.join(" ");
}

function formatWork(work: WorkModel): string {
  const parts: string[] = [];

  pushMetric(parts, "w", work.writes);
  pushMetric(parts, "sr", work.sinkReads);
  pushMetric(parts, "pr", work.producerReads);
  pushMetric(parts, "cr", work.consumerReads);
  pushMetric(parts, "runs", work.computeRuns);
  pushMetric(parts, "cand", work.recomputeCandidates);
  pushMetric(parts, "inv", work.invalidated);
  pushMetric(parts, "edge", work.edgeTraversals);
  pushMetric(parts, "sched", work.scheduledWatchers);
  pushMetric(parts, "flush", work.flushes);
  pushMetric(parts, "add", work.depsAdded);
  pushMetric(parts, "drop", work.depsDropped);
  pushMetric(parts, "wc", work.watchersCreated);
  pushMetric(parts, "wd", work.watchersDisposed);

  return parts.length === 0 ? "empty" : parts.join(" ");
}

function printLegendOnce(): void {
  if (printedLegend) return;
  printedLegend = true;

  process.stdout.write(
    "\nmodeledWork legend: w=writes sr=sinkReads pr=producerReads cr=consumerReads runs=computeRuns cand=recomputeCandidates inv=invalidated edge=edgeTraversals sched=scheduledWatchers flush=flushes add/drop=deps churn wc/wd=watchers created/disposed\n",
  );
}

function printScenarioModel(scenario: Scenario): void {
  process.stdout.write(
    [
      `\n${scenario.label}`,
      `  class: ${scenario.pressure}/${scenario.topology}/${scenario.workload}/${scenario.size}`,
      `  params: ${formatParams(scenario) || "none"}`,
      `  work:   ${formatWork(scenario.modeledWork)}`,
      "",
    ].join("\n"),
  );
}

function resetScenarioRuntime(): void {
  resetRuntime();
  setInternalHooks(undefined, undefined);
}

function createHarnessBaseline(): BenchCase {
  return {
    step(iteration) {
      return (iteration * 1103515245 + 12345) >>> 0;
    },
  };
}

function selectEvery<T>(values: T[], ratio: number): T[] {
  const target = Math.max(1, Math.floor(values.length * ratio));
  const stride = Math.max(1, Math.floor(values.length / target));
  const selected: T[] = [];

  for (
    let index = 0;
    index < values.length && selected.length < target;
    index += stride
  ) {
    selected.push(values[index]!);
  }

  return selected;
}

function createLinearWriteReadTail(depth: number): BenchCase {
  resetScenarioRuntime();

  const source = createProducer(0);
  let tail = createConsumer(() => readProducer(source) + 1);

  for (let index = 1; index < depth; index += 1) {
    const previous = tail;
    tail = createConsumer(() => readConsumer(previous) + 1);
  }

  readConsumer(tail);

  let expected = depth;

  return {
    step(iteration) {
      writeProducer(source, iteration);
      expected = iteration + depth;
      return readConsumer(tail);
    },
    verify(checksum) {
      if ((expected | 0) !== checksum) {
        throw new Error(`linear tail checksum mismatch: ${checksum}`);
      }
    },
  };
}

function createLinearHotRead(depth: number): BenchCase {
  resetScenarioRuntime();

  const source = createProducer(0);
  let tail = createConsumer(() => readProducer(source) + 1);

  for (let index = 1; index < depth; index += 1) {
    const previous = tail;
    tail = createConsumer(() => readConsumer(previous) + 1);
  }

  readConsumer(tail);

  const expected = depth;

  return {
    step() {
      return readConsumer(tail);
    },
    verify(checksum) {
      if ((expected | 0) !== checksum) {
        throw new Error(`linear hot-read checksum mismatch: ${checksum}`);
      }
    },
  };
}

function createDiamondRepeated(count: number): BenchCase {
  resetScenarioRuntime();

  const source = createProducer(0);
  const sinks: ReactiveNode<number>[] = [];

  for (let index = 0; index < count; index += 1) {
    const shared = createConsumer(() => readProducer(source) + index);
    const left = createConsumer(() => readConsumer(shared) + 1);
    const right = createConsumer(() => readConsumer(shared) + 2);
    sinks.push(createConsumer(() => readConsumer(left) + readConsumer(right)));
  }

  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < sinks.length; index += 1) {
      total += readConsumer(sinks[index]!);
    }

    return total;
  });

  readConsumer(root);

  let expected = readConsumer(root);

  return {
    step(iteration) {
      writeProducer(source, iteration);
      expected = readConsumer(root);
      return expected;
    },
    verify(checksum) {
      if ((expected | 0) !== checksum) {
        throw new Error(`diamond checksum mismatch: ${checksum}`);
      }
    },
  };
}

function sumArithmeticSeries(length: number): number {
  return (length * (length - 1)) / 2;
}

function expectedWideFanout(width: number, sourceValue: number): number {
  return width * sourceValue + sumArithmeticSeries(width);
}

function expectedRepeatedDiamond(count: number, sourceValue: number): number {
  return count * (2 * sourceValue + 3) + 2 * sumArithmeticSeries(count);
}

function verifyExpected(
  label: string,
  expected: number,
  checksum: number,
): void {
  if ((expected | 0) !== checksum) {
    throw new Error(`${label} checksum mismatch: ${checksum}`);
  }
}

function createDiamondRepeatedVerified(count: number): BenchCase {
  const benchCase = createDiamondRepeated(count);
  let expected = expectedRepeatedDiamond(count, 0);

  return {
    step(iteration) {
      expected = expectedRepeatedDiamond(count, iteration);
      return benchCase.step(iteration);
    },
    verify(checksum) {
      verifyExpected("diamond", expected, checksum);
    },
  };
}

function createWideFanoutReadAllVerified(width: number): BenchCase {
  const benchCase = createWideFanoutReadAll(width);
  let expected = expectedWideFanout(width, 0);

  return {
    step(iteration) {
      expected = expectedWideFanout(width, iteration);
      return benchCase.step(iteration);
    },
    verify(checksum) {
      verifyExpected("wide fanout", expected, checksum);
    },
  };
}

function createWideFaninReadOneVerified(width: number): BenchCase {
  const benchCase = createWideFaninReadOne(width);
  const values = Array.from({ length: width }, (_, index) => index);
  let expected = sumArithmeticSeries(width);

  return {
    step(iteration) {
      const updatedIndex = iteration % width;
      values[updatedIndex] = iteration;
      expected = 0;
      for (let index = 0; index < values.length; index += 1) {
        expected += values[index]!;
      }
      return benchCase.step(iteration);
    },
    verify(checksum) {
      verifyExpected("wide fanin", expected, checksum);
    },
  };
}

function createManyWritesReadOnceVerified(
  batchSize: number,
  width: number,
): BenchCase {
  const benchCase = createManyWritesReadOnce(batchSize, width);
  const values = Array.from({ length: width }, (_, index) => index);
  let expected = sumArithmeticSeries(width);

  return {
    step(iteration) {
      for (let index = 0; index < batchSize; index += 1) {
        const sourceIndex = (iteration + index) % width;
        values[sourceIndex] = iteration + index;
      }

      expected = 0;
      for (let index = 0; index < values.length; index += 1) {
        expected += values[index]!;
      }

      return benchCase.step(iteration);
    },
    verify(checksum) {
      verifyExpected("many writes", expected, checksum);
    },
  };
}

function createEffectFlushFanoutVerified(width: number): BenchCase {
  const benchCase = createEffectFlushFanout(width);
  let expected = 0;

  return {
    step(iteration) {
      expected = iteration === 0 ? 0 : width;
      return benchCase.step(iteration);
    },
    verify(checksum) {
      verifyExpected("effect flush", expected, checksum);
    },
    dispose: benchCase.dispose,
  };
}

function createSelectorUpdateOneKeyVerified(entityCount: number): BenchCase {
  const benchCase = createSelectorUpdateOneKey(entityCount);
  let expected = 0;

  return {
    step(iteration) {
      const nextIndex = iteration % entityCount;
      expected = iteration * 2 + nextIndex;
      return benchCase.step(iteration);
    },
    verify(checksum) {
      verifyExpected("selector", expected, checksum);
    },
  };
}

function createDynamicBranchChurnVerified(deps: number): BenchCase {
  const benchCase = createDynamicBranchChurn(deps);

  return {
    step(iteration) {
      return benchCase.step(iteration);
    },
  };
}

function createLayeredPartialReadsVerified(
  width: number,
  layers: number,
  readRatio: number,
  updateRatio: number,
): BenchCase {
  return createLayeredPartialReads(width, layers, readRatio, updateRatio);
}

function createDenseLayeredReadAllVerified(
  width: number,
  layers: number,
  updateRatio: number,
): BenchCase {
  return createDenseLayeredReadAll(width, layers, updateRatio);
}

function createWideFanoutReadAll(width: number): BenchCase {
  resetScenarioRuntime();

  const source = createProducer(0);
  const leaves = Array.from({ length: width }, (_, index) =>
    createConsumer(() => readProducer(source) + index),
  );
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < leaves.length; index += 1) {
      total += readConsumer(leaves[index]!);
    }

    return total;
  });

  readConsumer(root);

  return {
    step(iteration) {
      writeProducer(source, iteration);
      return readConsumer(root);
    },
  };
}

function createWideFaninReadOne(width: number): BenchCase {
  resetScenarioRuntime();

  const sources = Array.from({ length: width }, (_, index) =>
    createProducer(index),
  );
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < sources.length; index += 1) {
      total += readProducer(sources[index]!);
    }

    return total;
  });

  readConsumer(root);

  return {
    step(iteration) {
      writeProducer(sources[iteration % sources.length]!, iteration);
      return readConsumer(root);
    },
  };
}

function createLayeredGraph({
  dense,
  layers,
  width,
}: {
  dense: boolean;
  layers: number;
  width: number;
}): LayeredGraph {
  const sources = Array.from({ length: width }, (_, index) =>
    createProducer(index),
  );
  let previous = sources.map((source) =>
    createConsumer(() => readProducer(source)),
  );

  for (let layerIndex = 0; layerIndex < layers; layerIndex += 1) {
    const sourceLayer = previous;
    const layer = Array.from({ length: width }, (_, index) => {
      if (dense) {
        return createConsumer(() => {
          let total = 0;

          for (let offset = 0; offset < 4; offset += 1) {
            total += readConsumer(
              sourceLayer[(index + offset) % sourceLayer.length]!,
            );
          }

          return total;
        });
      }

      const left = sourceLayer[index]!;
      const right = sourceLayer[(index + 1) % sourceLayer.length]!;
      return createConsumer(() => readConsumer(left) + readConsumer(right));
    });

    previous = layer;
  }

  return {
    sources,
    sinks: previous,
  };
}

function createLayeredPartialReads(
  width: number,
  layers: number,
  readRatio: number,
  updateRatio: number,
): BenchCase {
  resetScenarioRuntime();

  const { sources, sinks } = createLayeredGraph({
    dense: false,
    layers,
    width,
  });
  const readSinks = selectEvery(sinks, readRatio);
  const updateSources = selectEvery(sources, updateRatio);
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < readSinks.length; index += 1) {
      total += readConsumer(readSinks[index]!);
    }

    return total;
  });

  readConsumer(root);

  return {
    step(iteration) {
      for (let index = 0; index < updateSources.length; index += 1) {
        writeProducer(updateSources[index]!, iteration + index);
      }

      return readConsumer(root);
    },
  };
}

function createDenseLayeredReadAll(
  width: number,
  layers: number,
  updateRatio: number,
): BenchCase {
  resetScenarioRuntime();

  const { sources, sinks } = createLayeredGraph({ dense: true, layers, width });
  const updateSources = selectEvery(sources, updateRatio);
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < sinks.length; index += 1) {
      total += readConsumer(sinks[index]!);
    }

    return total;
  });

  readConsumer(root);

  return {
    step(iteration) {
      for (let index = 0; index < updateSources.length; index += 1) {
        writeProducer(updateSources[index]!, iteration + index);
      }

      return readConsumer(root);
    },
  };
}

function createDynamicBranchChurn(deps: number): BenchCase {
  resetScenarioRuntime();

  const gate = createProducer(true);
  const left = Array.from({ length: deps }, (_, index) =>
    createProducer(index),
  );
  const right = Array.from({ length: deps }, (_, index) =>
    createProducer(index + deps),
  );
  const selected = createConsumer(() => {
    const active = readProducer(gate) ? left : right;
    let total = 0;

    for (let index = 0; index < active.length; index += 1) {
      total += readProducer(active[index]!);
    }

    return total;
  });

  readConsumer(selected);

  return {
    step(iteration) {
      const nextGate = (iteration & 1) === 0;
      writeProducer(gate, nextGate);
      writeProducer((nextGate ? left : right)[iteration % deps]!, iteration);
      return readConsumer(selected);
    },
  };
}

function createDeepDynamicChurn(depth: number): BenchCase {
  resetScenarioRuntime();

  const gate = createProducer(true);
  let left = createConsumer(() => (readProducer(gate) ? 1 : 0));
  let right = createConsumer(() => (readProducer(gate) ? 0 : 1));
  let selected = createConsumer(() =>
    readProducer(gate) ? readConsumer(left) : readConsumer(right),
  );

  for (let index = 1; index < depth; index += 1) {
    const previousLeft = left;
    const previousRight = right;
    const previousSelected = selected;

    left = createConsumer(() => readConsumer(previousLeft) + 1);
    right = createConsumer(() => readConsumer(previousRight) + 1);
    selected = createConsumer(() =>
      readProducer(gate)
        ? readConsumer(previousSelected) + readConsumer(left)
        : readConsumer(previousSelected) + readConsumer(right),
    );
  }

  readConsumer(selected);

  return {
    step(iteration) {
      writeProducer(gate, (iteration & 1) === 0);
      return readConsumer(selected);
    },
  };
}

function createSelectorUpdateOneKey(entityCount: number): BenchCase {
  resetScenarioRuntime();

  const activeIndex = createProducer(0);
  const entities = Array.from({ length: entityCount }, (_, index) =>
    createProducer(index),
  );
  const projections = entities.map((entity, index) =>
    createConsumer(() => readProducer(entity) * 2 + index),
  );
  const selected = createConsumer(() =>
    readConsumer(projections[readProducer(activeIndex)]!),
  );

  readConsumer(selected);

  return {
    step(iteration) {
      const nextIndex = iteration % entityCount;
      writeProducer(activeIndex, nextIndex);
      writeProducer(entities[nextIndex]!, iteration);
      return readConsumer(selected);
    },
  };
}

function createDisposeChurn(count: number): BenchCase {
  resetScenarioRuntime();

  const source = createProducer(0);

  return {
    step(iteration) {
      let observed = 0;

      for (let index = 0; index < count; index += 1) {
        const watcher = createWatcher(() => {
          observed += readProducer(source) + index;
        });

        runWatcher(watcher);
        disposeWatcher(watcher);
      }

      writeProducer(source, iteration);
      return observed;
    },
  };
}

function createEffectFlushFanout(width: number): BenchCase {
  resetRuntime();

  const queue: ReactiveNode[] = [];
  setInternalHooks((node) => {
    queue.push(node);
  });

  const source = createProducer(0);
  const watchers = Array.from({ length: width }, (_, index) =>
    createWatcher(() => {
      readProducer(source);
      return index;
    }),
  );

  for (let index = 0; index < watchers.length; index += 1) {
    runWatcher(watchers[index]!);
  }

  return {
    step(iteration) {
      writeProducer(source, iteration);

      let flushed = 0;
      while (queue.length > 0) {
        runWatcher(queue.shift()!);
        flushed += 1;
      }

      return flushed;
    },
    dispose() {
      setInternalHooks(undefined, undefined);
    },
  };
}

function createBroadPropagationVerified(
  width: number,
  writes: number,
): BenchCase {
  resetRuntime();

  const queue: ReactiveNode[] = [];
  setInternalHooks((node) => {
    queue.push(node);
  });

  const head = createProducer(0);
  let last: ReactiveNode<number> = head;
  let callCount = 0;

  for (let index = 0; index < width; index += 1) {
    const current = createConsumer(() => readProducer(head) + index);
    const current2 = createConsumer(() => readConsumer(current) + 1);
    const watcher = createWatcher(() => {
      readConsumer(current2);
      callCount += 1;
    });

    runWatcher(watcher);
    last = current2;
  }

  function flushQueue(): number {
    let flushed = 0;

    while (queue.length > 0) {
      runWatcher(queue.shift()!);
      flushed += 1;
    }

    return flushed;
  }

  function writeBatched(value: number): void {
    enterPropagationScope();
    try {
      writeProducer(head, value);
    } finally {
      leavePropagationScope();
    }
    flushQueue();
  }

  return {
    step(iteration) {
      let checksum = 0;
      callCount = 0;

      writeBatched(iteration);

      for (let index = 0; index < writes; index += 1) {
        writeBatched(index);
        checksum ^= readConsumer(last) | 0;
      }

      return checksum ^ callCount;
    },
    dispose() {
      setInternalHooks(undefined, undefined);
    },
  };
}

function createManyWritesReadOnce(batchSize: number, width: number): BenchCase {
  resetScenarioRuntime();

  const sources = Array.from({ length: width }, (_, index) =>
    createProducer(index),
  );
  const root = createConsumer(() => {
    let total = 0;

    for (let index = 0; index < sources.length; index += 1) {
      total += readProducer(sources[index]!);
    }

    return total;
  });

  readConsumer(root);

  return {
    step(iteration) {
      for (let index = 0; index < batchSize; index += 1) {
        const sourceIndex = (iteration + index) % sources.length;
        writeProducer(sources[sourceIndex]!, iteration + index);
      }

      return readConsumer(root);
    },
  };
}

const scenarios: Scenario[] = [
  {
    pressure: "harness",
    topology: "baseline",
    workload: "empty",
    size: "small",
    label: "baseline/empty-harness/deterministic-counter",
    modeledWork: workModel({}),
    nodes: 0,
    sources: 0,
    sinks: 0,
    create: createHarnessBaseline,
  },
  {
    pressure: "stabilization",
    topology: "linear",
    workload: "writeReadOne",
    size: "medium",
    label: "linear/write-read-tail/depth-1000",
    modeledWork: workModel({
      writes: 1,
      sinkReads: 1,
      producerReads: 1,
      consumerReads: 999,
      computeRuns: 1_000,
      recomputeCandidates: 1_000,
      invalidated: 1_000,
      edgeTraversals: 1_999,
    }),
    nodes: 1_001,
    sources: 1,
    sinks: 1,
    depth: 1_000,
    create: () => createLinearWriteReadTail(1_000),
  },
  {
    pressure: "stabilization",
    topology: "linear",
    workload: "hotRead",
    size: "medium",
    label: "linear/hot-read/depth-1000",
    modeledWork: workModel({
      sinkReads: 1,
    }),
    nodes: 1_001,
    sources: 1,
    sinks: 1,
    depth: 1_000,
    create: () => createLinearHotRead(1_000),
  },
  {
    pressure: "stabilization",
    topology: "diamond",
    workload: "writeReadAll",
    size: "medium",
    label: "diamond/write-read-sink/repeated-256",
    modeledWork: workModel({
      writes: 1,
      sinkReads: 1,
      producerReads: 256,
      consumerReads: 1_024,
      computeRuns: 1_025,
      recomputeCandidates: 1_025,
      invalidated: 1_025,
      edgeTraversals: 2_049,
    }),
    nodes: 1_026,
    sources: 1,
    sinks: 256,
    fanout: 256,
    fanin: 2,
    create: () => createDiamondRepeatedVerified(256),
  },
  {
    pressure: "propagation",
    topology: "wideFanout",
    workload: "writeReadAll",
    size: "medium",
    label: "wide-fanout/write-read-all/fanout-1024",
    modeledWork: workModel({
      writes: 1,
      sinkReads: 1,
      producerReads: 1_024,
      consumerReads: 1_024,
      computeRuns: 1_025,
      recomputeCandidates: 1_025,
      invalidated: 1_025,
      edgeTraversals: 2_049,
    }),
    nodes: 1_026,
    sources: 1,
    sinks: 1_024,
    fanout: 1_024,
    create: () => createWideFanoutReadAllVerified(1_024),
  },
  {
    pressure: "stabilization",
    topology: "wideFanin",
    workload: "writeReadOne",
    size: "medium",
    label: "wide-fanin/write-read-one/fanin-1024",
    modeledWork: workModel({
      writes: 1,
      sinkReads: 1,
      producerReads: 1_024,
      computeRuns: 1,
      recomputeCandidates: 1,
      invalidated: 1,
      edgeTraversals: 1_025,
    }),
    nodes: 1_025,
    sources: 1_024,
    sinks: 1,
    fanin: 1_024,
    create: () => createWideFaninReadOneVerified(1_024),
  },
  {
    pressure: "selectivity",
    topology: "layered",
    workload: "partialReads",
    size: "medium",
    label: "layered/partial-read/64x4-read12-update6",
    modeledWork: workModel({
      writes: 4,
      sinkReads: 1,
      producerReads: 64,
      consumerReads: 264,
      computeRuns: 33,
      recomputeCandidates: 33,
      invalidated: 32,
      edgeTraversals: 96,
    }),
    nodes: 321,
    sources: 64,
    sinks: 8,
    width: 64,
    layers: 4,
    readRatio: 0.125,
    updateRatio: 0.0625,
    create: () => createLayeredPartialReadsVerified(64, 4, 0.125, 0.0625),
  },
  {
    pressure: "propagation",
    topology: "denseLayered",
    workload: "writeReadAll",
    size: "medium",
    label: "dense-layered/write-read-all/32x4-fanin4-update12",
    modeledWork: workModel({
      writes: 4,
      sinkReads: 1,
      producerReads: 32,
      consumerReads: 544,
      computeRuns: 129,
      recomputeCandidates: 129,
      invalidated: 128,
      edgeTraversals: 640,
    }),
    nodes: 161,
    sources: 32,
    sinks: 32,
    width: 32,
    layers: 4,
    fanin: 4,
    updateRatio: 0.125,
    create: () => createDenseLayeredReadAllVerified(32, 4, 0.125),
  },
  {
    pressure: "tracking",
    topology: "dynamicBranch",
    workload: "dynamicChurn",
    size: "medium",
    label: "dynamic-branch/churn/deps-512-toggle50",
    modeledWork: workModel({
      writes: 2,
      sinkReads: 1,
      producerReads: 513,
      computeRuns: 1,
      recomputeCandidates: 1,
      invalidated: 1,
      edgeTraversals: 1_025,
      depsAdded: 512,
      depsDropped: 512,
    }),
    nodes: 1_026,
    sources: 1_025,
    sinks: 1,
    fanin: 512,
    dynamicRatio: 0.5,
    create: () => createDynamicBranchChurnVerified(512),
  },
  {
    pressure: "tracking",
    topology: "deepDynamic",
    workload: "dynamicChurn",
    size: "medium",
    label: "deep-dynamic/churn/depth-512-toggle50",
    modeledWork: workModel({
      writes: 1,
      sinkReads: 1,
      producerReads: 512,
      consumerReads: 1_534,
      computeRuns: 1_535,
      recomputeCandidates: 1_535,
      invalidated: 1_535,
      edgeTraversals: 3_069,
      depsAdded: 512,
      depsDropped: 512,
    }),
    nodes: 1_537,
    sources: 1,
    sinks: 1,
    depth: 512,
    dynamicRatio: 0.5,
    create: () => createDeepDynamicChurn(512),
  },
  {
    pressure: "selectivity",
    topology: "selector",
    workload: "updateOneKey",
    size: "medium",
    label: "selector/update-one-key/entities-4096-active1",
    modeledWork: workModel({
      writes: 2,
      sinkReads: 1,
      producerReads: 2,
      consumerReads: 1,
      computeRuns: 2,
      recomputeCandidates: 2,
      invalidated: 2,
      edgeTraversals: 4,
    }),
    nodes: 8_194,
    sources: 4_097,
    sinks: 1,
    readRatio: 1 / 4_096,
    updateRatio: 1 / 4_096,
    create: () => createSelectorUpdateOneKeyVerified(4_096),
  },
  {
    pressure: "scheduler",
    topology: "effectLeaves",
    workload: "effectFlush",
    size: "medium",
    label: "effect-leaves/effect-flush/watchers-1024",
    modeledWork: workModel({
      writes: 1,
      producerReads: 1_024,
      invalidated: 1_024,
      edgeTraversals: 1_024,
      scheduledWatchers: 1_024,
      flushes: 1_024,
    }),
    nodes: 1_025,
    sources: 1,
    sinks: 1_024,
    fanout: 1_024,
    create: () => createEffectFlushFanoutVerified(1_024),
  },
  {
    pressure: "scheduler",
    topology: "broadPropagation",
    workload: "batchedWritesReadTail",
    size: "small",
    label: "broad-propagation/batched-writes-read-tail/width-50-writes-50",
    modeledWork: workModel({
      writes: 51,
      sinkReads: 50,
      producerReads: 2_550,
      consumerReads: 5_150,
      computeRuns: 5_100,
      recomputeCandidates: 5_100,
      invalidated: 7_650,
      edgeTraversals: 10_200,
      scheduledWatchers: 2_550,
      flushes: 2_550,
    }),
    nodes: 151,
    sources: 1,
    sinks: 50,
    fanout: 50,
    batchSize: 50,
    create: () => createBroadPropagationVerified(50, 50),
  },
  {
    pressure: "scheduler",
    topology: "disposeChurn",
    workload: "lifecycleChurn",
    size: "medium",
    label: "dispose-churn/create-dispose-watchers/count-1024",
    modeledWork: workModel({
      writes: 1,
      producerReads: 1_024,
      computeRuns: 1_024,
      edgeTraversals: 2_048,
      depsAdded: 1_024,
      depsDropped: 1_024,
      watchersCreated: 1_024,
      watchersDisposed: 1_024,
    }),
    nodes: 1_025,
    sources: 1,
    sinks: 1_024,
    fanout: 1_024,
    create: () => createDisposeChurn(1_024),
  },
  {
    pressure: "stabilization",
    topology: "wideFanin",
    workload: "manyWritesReadOnce",
    size: "medium",
    label: "wide-fanin/many-writes-read-once/sources-1024-batch-32",
    modeledWork: workModel({
      writes: 32,
      sinkReads: 1,
      producerReads: 1_024,
      computeRuns: 1,
      recomputeCandidates: 1,
      invalidated: 1,
      edgeTraversals: 1_056,
    }),
    nodes: 1_025,
    sources: 1_024,
    sinks: 1,
    fanin: 1_024,
    batchSize: 32,
    create: () => createManyWritesReadOnceVerified(32, 1_024),
  },
];

function registerScenario(scenario: Scenario): void {
  let instance: BenchCase | null = null;
  let iteration = 0;
  let checksum = 0;

  describe(`runtime taxonomy | ${scenario.pressure} | ${scenario.label}`, () => {
    beforeAll(() => {
      printLegendOnce();
      printScenarioModel(scenario);
    });

    afterAll(() => {
      instance?.verify?.(checksum);
      instance?.dispose?.();
      instance = null;
      iteration = 0;
      checksum = 0;
    });

    bench(
      `measure | ${formatWork(scenario.modeledWork)}`,
      () => {
        instance ??= scenario.create();
        iteration += 1;
        checksum = instance.step(iteration);
        blackhole(checksum);
        return blackholeValue;
      },
      {
        warmupIterations: WARMUP_ITERATIONS,
        iterations: ITERATIONS,
        warmupTime: 20,
        time: 100,
      },
    );
  });
}

for (const scenario of scenarios) {
  registerScenario(scenario);
}
