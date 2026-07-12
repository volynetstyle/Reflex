import { bench, describe } from "vitest";
import {
  configureRuntimeContext,
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime/internal";
import {
  createFlushScheduler,
  enterSchedulerBatch,
  leaveSchedulerBatch,
} from "../src";

const SOURCE_COUNT = 32;
const WARMUP_ITERATIONS = 100;
const ITERATIONS = 1_000;
let checksum = 0;
let iteration = 0;
let nextValue = 0;

type FullGraph = ReturnType<typeof createFullGraph>;

function createFullGraph() {
  const scheduler = createFlushScheduler();
  configureRuntimeContext({
    hooks: { sinkInvalidatedDispatcher: scheduler.enqueue },
  });
  const sources = Array.from({ length: SOURCE_COUNT }, (_, index) =>
    createProducer(index),
  );
  const leaves = sources.map((source, index) =>
    createConsumer(() => readProducer(source) + index),
  );
  const root = createConsumer(() =>
    leaves.reduce((sum, leaf) => sum + readConsumer(leaf), 0),
  );
  const watcher = createWatcher(() => {
    checksum ^= readConsumer(root);
  });
  runWatcher(watcher);
  return { scheduler, sources, root };
}

function graphBench(
  name: string,
  run: (graph: FullGraph) => void,
  before?: (graph: FullGraph) => void,
  after?: (graph: FullGraph) => void,
) {
  let graph: FullGraph;
  bench(name, () => run(graph), {
    warmupIterations: WARMUP_ITERATIONS,
    iterations: ITERATIONS,
    warmupTime: 20,
    time: 100,
    setup() {
      graph = createFullGraph();
      before?.(graph);
    },
    teardown() {
      after?.(graph);
      graph.scheduler.reset();
      resetRuntimeContext();
    },
  });
}

describe("scheduler full graph", () => {
  graphBench("A writes only no batch", (graph) => {
    writeProducer(graph.sources[0]!, ++nextValue);
    graph.scheduler.flush();
  });

  graphBench("D final read only after dirty writes", (graph) => {
    writeProducer(graph.sources[0]!, ++nextValue);
    checksum ^= readConsumer(graph.root);
    graph.scheduler.reset();
  });

  for (const sourceCount of [1, 4, 32]) {
    graphBench(
      `pattern no batch, ${sourceCount === 1 ? "same source" : `rotating ${sourceCount} sources`}`,
      (graph) => {
        writeProducer(graph.sources[iteration++ % sourceCount]!, ++nextValue);
        graph.scheduler.flush();
      },
    );
  }

  graphBench(
    "B writes only outer batch",
    (graph) => writeProducer(graph.sources[0]!, ++nextValue),
    (graph) => enterSchedulerBatch(graph.scheduler.core),
    (graph) => {
      leaveSchedulerBatch(graph.scheduler.core);
      graph.scheduler.flush();
    },
  );
  graphBench("C writes only batch per iteration", (graph) => {
    graph.scheduler.batch(() => writeProducer(graph.sources[0]!, ++nextValue));
    graph.scheduler.flush();
  });

  for (const sourceCount of [1, 4, 32]) {
    graphBench(
      `pattern outer batch, ${sourceCount === 1 ? "same source" : `rotating ${sourceCount} sources`}`,
      (graph) => {
        writeProducer(graph.sources[iteration++ % sourceCount]!, ++nextValue);
      },
      (graph) => enterSchedulerBatch(graph.scheduler.core),
      (graph) => {
        leaveSchedulerBatch(graph.scheduler.core);
        graph.scheduler.flush();
      },
    );
  }

  graphBench("E batch enter exit empty", (graph) =>
    graph.scheduler.batch(() => undefined),
  );
  graphBench(
    "F batch enter exit on dirty graph",
    (graph) => graph.scheduler.batch(() => undefined),
    (graph) => writeProducer(graph.sources[0]!, ++nextValue),
  );
});
