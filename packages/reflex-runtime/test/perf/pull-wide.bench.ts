import { beforeAll, bench, describe } from "vitest";

import {
  Both,
  Changed,
  Unknown,
  type ReactiveEdge,
  type ReactiveNode,
} from "../../src/kernel/shape";
import { pull_frontier } from "../../src/kernel/stages/second/pull_frontier";
import {
  pull_dependency,
  should_recompute,
} from "../../src/kernel/stages/second/pull_dependency";
import {
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
} from "../runtime.test_utils";

const widths = [16, 64, 256, 1_024, 4_096] as const;
const sparseCounts = [1, 2, 4, 8, 16] as const;

let blackhole = 0;

interface WideCase {
  step(iteration: number): number;
}

function incomingEdges(node: ReactiveNode): ReactiveEdge[] {
  const edges: ReactiveEdge[] = [];
  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    edges.push(edge);
  }
  return edges;
}

function createWideCase(
  width: number,
  mode: "clean" | "head" | "tail" | "equality",
): WideCase {
  resetRuntime();

  const sources = Array.from({ length: width }, () => createProducer(0));
  const leaves = sources.map((source, index) =>
    createConsumer(() => {
      const value = readProducer(source);
      return mode === "equality" && index === width - 1 ? 0 : value;
    }),
  );
  const root = createConsumer(() => {
    let total = 0;
    for (let index = 0; index < width; index += 1) {
      total += readConsumer(leaves[index]!);
    }
    return total;
  });

  readConsumer(root);
  const edges = incomingEdges(root);
  const target = mode === "head" ? 0 : width - 1;

  const arm = (iteration: number): void => {
    root.state |= Unknown;
    if (mode === "clean") return;

    sources[target]!.payload = iteration;
    leaves[target]!.state = (leaves[target]!.state & ~Unknown) | Changed;
  };

  arm(1);

  return {
    step(iteration) {
      const changed = should_recompute(root, edges[0]!);
      root.state &= ~Both;
      arm(iteration + 1);
      return (changed ? 1 : 0) ^ iteration;
    },
  };
}

function createSparseExhaustiveCase(
  width: number,
  dirtyCount: number,
): WideCase {
  resetRuntime();

  const sources = Array.from({ length: width }, () => createProducer(0));
  const leaves = sources.map((source) =>
    createConsumer(() => readProducer(source)),
  );
  const root = createConsumer(() => {
    let total = 0;
    for (let index = 0; index < width; index += 1) {
      total += readConsumer(leaves[index]!);
    }
    return total;
  });

  readConsumer(root);
  const edges = incomingEdges(root);

  const arm = (iteration: number): void => {
    root.state |= Unknown;
    for (let index = 0; index < dirtyCount; index += 1) {
      const target = Math.floor((index * width) / dirtyCount);
      sources[target]!.payload = iteration;
      leaves[target]!.state = (leaves[target]!.state & ~Unknown) | Changed;
    }
  };

  arm(1);

  return {
    step(iteration) {
      let changed = false;
      for (let index = 0; index < edges.length; index += 1) {
        if (pull_dependency(edges[index]!)) changed = true;
      }
      root.state &= ~Both;
      arm(iteration + 1);
      return (changed ? 1 : 0) ^ iteration;
    },
  };
}

function createWatcherFrontierCase(
  width: number,
  dirtyCount: number,
): WideCase {
  resetRuntime();

  const sources = Array.from({ length: width }, () => createProducer(0));
  const leaves = sources.map((source) =>
    createConsumer(() => readProducer(source)),
  );
  const watcher = createWatcher(() => {
    for (let index = 0; index < width; index += 1) {
      readConsumer(leaves[index]!);
    }
  });

  runWatcher(watcher);

  const arm = (iteration: number): void => {
    watcher.state |= Unknown;
    for (let index = 0; index < dirtyCount; index += 1) {
      const target = Math.floor((index * width) / dirtyCount);
      sources[target]!.payload = iteration;
      leaves[target]!.state = (leaves[target]!.state & ~Unknown) | Changed;
    }
  };

  arm(1);

  return {
    step(iteration) {
      const changed = pull_frontier(watcher, watcher.firstIn);
      watcher.state &= ~Both;
      arm(iteration + 1);
      return (changed ? 1 : 0) ^ iteration;
    },
  };
}

function register(name: string, create: () => WideCase): void {
  describe(`wide pull probes | ${name}`, () => {
    let instance: WideCase | null = null;
    let iteration = 0;

    beforeAll(() => {
      instance = create();
    });

    bench(
      "step",
      () => {
        iteration += 1;
        instance ??= create();
        blackhole ^= instance.step(iteration);
        return blackhole;
      },
      {
        warmupIterations: 50,
        iterations: 500,
        warmupTime: 20,
        time: 100,
      },
    );
  });
}

for (const width of widths) {
  register(`W1 clean / ${width}`, () => createWideCase(width, "clean"));
  register(`W2 tail changed / ${width}`, () => createWideCase(width, "tail"));
  register(`W3 head changed / ${width}`, () => createWideCase(width, "head"));
  register(`W4 tail equality / ${width}`, () =>
    createWideCase(width, "equality"),
  );
}

for (const dirtyCount of sparseCounts) {
  register(`W5 sparse exhaustive / 4096 / ${dirtyCount}`, () =>
    createSparseExhaustiveCase(4_096, dirtyCount),
  );
  register(`WF sparse watcher / 4096 / ${dirtyCount}`, () =>
    createWatcherFrontierCase(4_096, dirtyCount),
  );
}
