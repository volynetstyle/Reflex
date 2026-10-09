function counters() {
  return {
    signalReads: 0,
    signalWrites: 0,
    computedRuns: 0,
    effectRuns: 0,
    checksum: 0,
  };
}

function signal(api, stats, initial) {
  const cell = api.signal(initial);
  return {
    read() {
      stats.signalReads++;
      return cell.read();
    },
    write(value) {
      stats.signalWrites++;
      cell.write(value);
    },
  };
}

function computed(api, stats, fn) {
  return api.computed(() => {
    stats.computedRuns++;
    return fn();
  });
}

function effect(api, stats, fn) {
  return api.effect(() => {
    stats.effectRuns++;
    fn();
  });
}

function settle(api, fn) {
  api.batch(fn);
  api.flush();
}

function assertEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function instance(stats, run, validate, metadata = {}) {
  return { stats, run, validate, metadata };
}

function changedLeaf(api) {
  const stats = counters();
  const source = signal(api, stats, 0);
  let expected = 0;
  effect(api, stats, () => {
    stats.checksum = source.read();
  });
  return instance(
    stats,
    () => settle(api, () => source.write(++expected)),
    () => assertEqual(stats.checksum, expected, "changed-leaf"),
  );
}

function equalLeaf(api) {
  const stats = counters();
  const source = signal(api, stats, 1);
  effect(api, stats, () => {
    stats.checksum = source.read();
  });
  return instance(
    stats,
    () => settle(api, () => source.write(1)),
    () => assertEqual(stats.checksum, 1, "equal-leaf"),
    {
      semanticPath: "same-value producer write",
      expectedComputedRunsPerOperation: 0,
      expectedEffectRunsPerOperation: 0,
      purpose: "write equality and transaction/settle boundary",
    },
  );
}

function equalWriteDirect(api) {
  const stats = counters();
  const source = signal(api, stats, 1);
  effect(api, stats, () => {
    stats.checksum = source.read();
  });
  return instance(
    stats,
    () => source.write(1),
    () => assertEqual(stats.checksum, 1, "equal-write-direct"),
    {
      semanticPath: "same-value producer write without transaction/settle",
      expectedComputedRunsPerOperation: 0,
      expectedEffectRunsPerOperation: 0,
      purpose: "producer equality with public batch/flush cost removed",
    },
  );
}

function equalResult(api) {
  const stats = counters();
  const source = signal(api, stats, 0);
  const derived = computed(api, stats, () => source.read() & 1);
  let value = 0;
  effect(api, stats, () => {
    stats.checksum = derived.read();
  });
  return instance(
    stats,
    () => settle(api, () => source.write((value += 2))),
    () => assertEqual(stats.checksum, 0, "equal-result"),
    {
      semanticPath: "changed producer, equal computed result",
      expectedComputedRunsPerOperation: 1,
      expectedEffectRunsPerOperation: 0,
      purpose: "isolated recompute/equality/tracking path",
    },
  );
}

function changedResult(api) {
  const stats = counters();
  const source = signal(api, stats, 0);
  const derived = computed(api, stats, () => source.read());
  let value = 0;
  effect(api, stats, () => {
    stats.checksum = derived.read();
  });
  return instance(
    stats,
    () => settle(api, () => source.write(++value)),
    () => assertEqual(stats.checksum, value, "changed-result"),
    {
      semanticPath: "changed producer, changed computed result",
      expectedComputedRunsPerOperation: 1,
      expectedEffectRunsPerOperation: 1,
      purpose: "control for downstream watcher/scheduler delivery",
    },
  );
}

function cleanEdge(api, depth) {
  const stats = counters();
  const source = signal(api, stats, 1);
  let node = computed(api, stats, () => source.read());
  node.read();
  for (let level = 1; level < depth; level++) {
    const previous = node;
    node = computed(api, stats, () => previous.read() + 1);
    // Materialize incrementally so this scenario measures clean traversal,
    // not recursive first evaluation of an entirely lazy chain.
    node.read();
  }
  const root = node;
  const expected = depth;
  assertEqual(root.read(), expected, "clean-edge:init");
  return instance(
    stats,
    () => {
      stats.checksum = (stats.checksum + root.read()) | 0;
    },
    () => assertEqual(root.read(), expected, "clean-edge"),
    {
      retainedDepth: depth,
      operation:
        "cached root read; no source mutation or chain traversal required",
    },
  );
}

function changedChain(api, depth) {
  const stats = counters();
  const source = signal(api, stats, 0);
  let node = computed(api, stats, () => source.read());
  node.read();
  for (let level = 1; level < depth; level++) {
    const previous = node;
    node = computed(api, stats, () => previous.read() + 1);
    node.read();
  }
  const root = node;
  let expected = 0;
  effect(api, stats, () => {
    stats.checksum = root.read();
  });
  return instance(
    stats,
    () => settle(api, () => source.write(++expected)),
    () => assertEqual(stats.checksum, expected + depth - 1, "changed-chain"),
    { depth },
  );
}

function deepUnknown(api, depth) {
  const stats = counters();
  const source = signal(api, stats, 0);
  let node = computed(api, stats, () => source.read() & 1);
  node.read();
  for (let level = 1; level < depth; level++) {
    const previous = node;
    node = computed(api, stats, () => previous.read());
    node.read();
  }
  const root = node;
  let value = 0;
  effect(api, stats, () => {
    stats.checksum = root.read();
  });
  return instance(
    stats,
    () => settle(api, () => source.write((value += 2))),
    () => assertEqual(stats.checksum, 0, "deep-unknown"),
    { depth, stableDerivedValue: true },
  );
}

function wideFanout(api, width) {
  const stats = counters();
  const source = signal(api, stats, 0);
  const leaves = Array.from({ length: width }, (_, index) =>
    computed(api, stats, () => source.read() + index),
  );
  const observations = new Array(width).fill(0);
  let value = 0;
  for (let index = 0; index < width; index++) {
    effect(api, stats, () => {
      observations[index] = leaves[index].read();
    });
  }
  return instance(
    stats,
    () => settle(api, () => source.write(++value)),
    () => {
      let total = 0;
      for (let index = 0; index < width; index++) {
        assertEqual(observations[index], value + index, `wide-fanout:${index}`);
        total += observations[index];
      }
      stats.checksum = total;
    },
    { fanOut: width, independentSinks: width },
  );
}

function diamondFanIn(api, width) {
  const stats = counters();
  const source = signal(api, stats, 0);
  const branches = Array.from({ length: width }, (_, index) =>
    computed(api, stats, () => source.read() + index),
  );
  const root = computed(api, stats, () => {
    let total = 0;
    for (const branch of branches) total += branch.read();
    return total;
  });
  let value = 0;
  effect(api, stats, () => {
    stats.checksum = root.read();
  });
  return instance(
    stats,
    () => settle(api, () => source.write(++value)),
    () =>
      assertEqual(
        stats.checksum,
        width * value + (width * (width - 1)) / 2,
        "diamond-fan-in",
      ),
    { fanIn: width, fanOut: width },
  );
}

function layeredDag(api, width) {
  const stats = counters();
  const depth = 8;
  const source = signal(api, stats, 0);
  let layer = Array.from({ length: width }, (_, index) =>
    computed(api, stats, () => source.read() + index),
  );
  for (let level = 1; level < depth; level++) {
    const previous = layer;
    layer = Array.from({ length: width }, (_, index) =>
      computed(
        api,
        stats,
        () =>
          previous[index].read() +
          previous[(index + 1) % previous.length].read(),
      ),
    );
  }
  // Observe the whole last layer. Reading only layer[0] would leave most of a
  // wide graph unreachable once width exceeds the fixed depth.
  const root = computed(api, stats, () => {
    let total = 0;
    for (const node of layer) total += node.read();
    return total;
  });
  let value = 0;
  effect(api, stats, () => {
    stats.checksum = root.read();
  });
  const expectedRoot = () => {
    let model = Array.from({ length: width }, (_, index) => value + index);
    for (let level = 1; level < depth; level++) {
      const previous = model;
      model = Array.from(
        { length: width },
        (_, index) => previous[index] + previous[(index + 1) % previous.length],
      );
    }
    return model.reduce((total, item) => total + item, 0);
  };
  return instance(
    stats,
    () => settle(api, () => source.write(++value)),
    () => assertEqual(stats.checksum, expectedRoot(), "layered-dag"),
    { depth, width, sharedDependencies: width * (depth - 1) * 2 },
  );
}

function selectiveUpdate(api, size) {
  const stats = counters();
  const sources = Array.from({ length: size }, (_, index) =>
    signal(api, stats, index),
  );
  const leaves = sources.map((source) =>
    computed(api, stats, () => source.read() * 2),
  );
  const root = computed(api, stats, () => {
    let total = 0;
    for (const leaf of leaves) total += leaf.read();
    return total;
  });
  const values = Array.from({ length: size }, (_, index) => index);
  let cursor = 0;
  effect(api, stats, () => {
    stats.checksum = root.read();
  });
  return instance(
    stats,
    () => {
      const index = cursor++ % size;
      values[index]++;
      settle(api, () => sources[index].write(values[index]));
    },
    () =>
      assertEqual(
        stats.checksum,
        values.reduce((total, value) => total + value * 2, 0),
        "selective-update",
      ),
    { dirtyFraction: 1 / size },
  );
}

function mostlyDirty(api, size) {
  const stats = counters();
  const sources = Array.from({ length: size }, (_, index) =>
    signal(api, stats, index),
  );
  const root = computed(api, stats, () => {
    let total = 0;
    for (const source of sources) total += source.read();
    return total;
  });
  const values = Array.from({ length: size }, (_, index) => index);
  const dirty = Math.max(1, Math.floor(size * 0.75));
  let cursor = 0;
  effect(api, stats, () => {
    stats.checksum = root.read();
  });
  return instance(
    stats,
    () =>
      settle(api, () => {
        for (let offset = 0; offset < dirty; offset++) {
          const index = (cursor + offset) % size;
          sources[index].write(++values[index]);
        }
        cursor = (cursor + dirty) % size;
      }),
    () =>
      assertEqual(
        stats.checksum,
        values.reduce((total, value) => total + value, 0),
        "mostly-dirty",
      ),
    { dirtyFraction: dirty / size, writesPerOperation: dirty },
  );
}

function semanticNoopFanout(api, width) {
  const stats = counters();
  const source = signal(api, stats, 0);
  const leaves = Array.from({ length: width }, () =>
    computed(api, stats, () => source.read() & 1),
  );
  const root = computed(api, stats, () => {
    let total = 0;
    for (const leaf of leaves) total += leaf.read();
    return total;
  });
  let value = 0;
  effect(api, stats, () => {
    stats.checksum = root.read();
  });
  return instance(
    stats,
    () => settle(api, () => source.write((value += 2))),
    () => assertEqual(stats.checksum, 0, "semantic-noop-fanout"),
    {
      fanOut: width,
      stableDerivedValue: true,
      purpose: "changed source with a semantically stable wide frontier",
    },
  );
}

function windowDependencyChurn(api, size) {
  const stats = counters();
  const windowSize = Math.max(1, Math.floor(size / 4));
  const offset = signal(api, stats, 0);
  const sources = Array.from({ length: size }, (_, index) =>
    signal(api, stats, index),
  );
  const values = Array.from({ length: size }, (_, index) => index);
  const selectedWindow = computed(api, stats, () => {
    const start = offset.read();
    let total = 0;
    for (let index = 0; index < windowSize; index++) {
      total += sources[(start + index) % size].read();
    }
    return total;
  });
  let currentOffset = 0;
  effect(api, stats, () => {
    stats.checksum = selectedWindow.read();
  });
  return instance(
    stats,
    () => {
      const nextOffset = (currentOffset + windowSize) % size;
      const changedIndex = nextOffset;
      values[changedIndex]++;
      settle(api, () => {
        offset.write(nextOffset);
        sources[changedIndex].write(values[changedIndex]);
      });
      currentOffset = nextOffset;
    },
    () => {
      let expected = 0;
      for (let index = 0; index < windowSize; index++) {
        expected += values[(currentOffset + index) % size];
      }
      assertEqual(stats.checksum, expected, "window-dependency-churn");
    },
    {
      dependenciesAddedPerOperation: windowSize,
      dependenciesRemovedPerOperation: windowSize,
      topologyChangesPerOperation: windowSize * 2,
    },
  );
}

function effectFanout(api, width) {
  const stats = counters();
  const source = signal(api, stats, 0);
  const derived = computed(api, stats, () => source.read() + 1);
  const observations = new Array(width).fill(0);
  let value = 0;
  for (let index = 0; index < width; index++) {
    effect(api, stats, () => {
      observations[index] = derived.read();
    });
  }
  return instance(
    stats,
    () => settle(api, () => source.write(++value)),
    () => {
      const expected = value + 1;
      for (const observation of observations) {
        assertEqual(observation, expected, "effect-fanout");
      }
      stats.checksum = expected * width;
    },
    { fanOut: width, observers: width, schedulerWork: true },
  );
}

function syntheticBody(value, iterations) {
  let result = value | 0;
  for (let index = 0; index < iterations; index++) {
    result = (Math.imul(result ^ index, 1664525) + 1013904223) | 0;
  }
  return result;
}

function effectFanoutBody(api, bodyIterations) {
  const width = 32;
  const stats = counters();
  const source = signal(api, stats, 0);
  const derived = computed(api, stats, () => source.read() + 1);
  const observations = new Array(width).fill(0);
  let value = 0;
  for (let index = 0; index < width; index++) {
    effect(api, stats, () => {
      observations[index] = syntheticBody(derived.read(), bodyIterations);
    });
  }
  return instance(
    stats,
    () => settle(api, () => source.write(++value)),
    () => {
      const expected = syntheticBody(value + 1, bodyIterations);
      for (const observation of observations) {
        assertEqual(observation, expected, "effect-fanout-body");
      }
      stats.checksum = expected;
    },
    {
      fanOut: width,
      observers: width,
      schedulerWork: true,
      bodyIterations,
      purpose: "amortization of fixed watcher overhead",
    },
  );
}

function lifecycleChurn(api, observers) {
  const stats = counters();
  const source = signal(api, stats, 0);
  let value = 0;
  let lastActiveValue = 0;
  return instance(
    stats,
    () => {
      const observations = new Array(observers).fill(-1);
      let disposers;
      // Create the observer group under one public transaction. This gives
      // queued-effect runtimes one drain, while immediate runtimes preserve
      // their public behavior.
      settle(api, () => {
        disposers = Array.from({ length: observers }, (_, index) =>
          effect(api, stats, () => {
            observations[index] = source.read();
          }),
        );
      });
      settle(api, () => source.write(++value));
      lastActiveValue = value;
      const effectsBeforeDispose = stats.effectRuns;
      for (let index = disposers.length - 1; index >= 0; index--) {
        disposers[index]();
      }
      settle(api, () => source.write(++value));
      assertEqual(
        stats.effectRuns,
        effectsBeforeDispose,
        "lifecycle-churn:dispose",
      );
      for (const observation of observations) {
        assertEqual(observation, lastActiveValue, "lifecycle-churn:active");
      }
      stats.checksum = lastActiveValue * observers;
    },
    () =>
      assertEqual(
        stats.checksum,
        lastActiveValue * observers,
        "lifecycle-churn",
      ),
    {
      observerCreationsPerOperation: observers,
      observerDisposalsPerOperation: observers,
      writesPerOperation: 2,
    },
  );
}

function failureRetry(api, depth) {
  const stats = counters();
  const source = signal(api, stats, 1);
  const shouldThrow = signal(api, stats, false);
  let node = computed(api, stats, () => {
    if (shouldThrow.read()) throw new Error("benchmark failure");
    return source.read() * 2;
  });
  for (let level = 1; level < depth; level++) {
    const previous = node;
    node = computed(api, stats, () => previous.read() + 1);
  }
  const root = node;
  let value = 1;
  const initialValue = value * 2 + depth - 1;
  assertEqual(root.read(), initialValue, "failure-retry:init");
  stats.checksum = initialValue;
  return instance(
    stats,
    () => {
      settle(api, () => shouldThrow.write(true));
      try {
        root.read();
        throw new Error("failure-retry: expected root read to throw");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== "benchmark failure"
        ) {
          throw error;
        }
      }
      settle(api, () => {
        shouldThrow.write(false);
        source.write(++value);
      });
      stats.checksum = root.read();
    },
    () => assertEqual(stats.checksum, value * 2 + depth - 1, "failure-retry"),
    { depth, throwsPerOperation: 1, retriesPerOperation: 1 },
  );
}

function dynamicBranch(api, branches) {
  const stats = counters();
  const selector = signal(api, stats, 0);
  const sources = Array.from({ length: branches }, (_, index) =>
    signal(api, stats, index),
  );
  const selected = computed(api, stats, () => {
    const index = selector.read();
    return sources[index].read();
  });
  let selectedIndex = 0;
  effect(api, stats, () => {
    stats.checksum = selected.read();
  });
  return instance(
    stats,
    () => {
      const stale = selectedIndex;
      selectedIndex = (selectedIndex + 1) % branches;
      settle(api, () => {
        selector.write(selectedIndex);
        sources[stale].write(sources[stale].read() + branches);
      });
    },
    () =>
      assertEqual(
        stats.checksum,
        sources[selectedIndex].read(),
        "dynamic-branch",
      ),
    { topologyChangesPerOperation: 2 },
  );
}

function reorderDependencies(api, size) {
  const stats = counters();
  const offset = signal(api, stats, 0);
  const sources = Array.from({ length: size }, (_, index) =>
    signal(api, stats, index),
  );
  const reordered = computed(api, stats, () => {
    const shift = offset.read();
    let hash = 0;
    for (let index = 0; index < size; index++) {
      hash = (Math.imul(hash, 31) + sources[(index + shift) % size].read()) | 0;
    }
    return hash;
  });
  let shift = 0;
  effect(api, stats, () => {
    stats.checksum = reordered.read();
  });
  return instance(
    stats,
    () => {
      shift = (shift + 1) % size;
      settle(api, () => offset.write(shift));
    },
    () => {
      let expected = 0;
      for (let index = 0; index < size; index++) {
        expected = (Math.imul(expected, 31) + ((index + shift) % size)) | 0;
      }
      assertEqual(stats.checksum, expected, "reorder-dependencies");
    },
    { dependenciesReorderedPerOperation: size },
  );
}

function taskBoard(api, size) {
  const stats = counters();
  const states = Array.from({ length: size }, (_, index) =>
    signal(api, stats, index % 3),
  );
  const priorities = Array.from({ length: size }, (_, index) =>
    signal(api, stats, (index * 7) % 5),
  );
  const visible = states.map((state, index) =>
    computed(api, stats, () =>
      state.read() === 1 ? priorities[index].read() + 1 : 0,
    ),
  );
  const summary = computed(api, stats, () => {
    let total = 0;
    for (const item of visible) total += item.read();
    return total;
  });
  const stateValues = Array.from({ length: size }, (_, index) => index % 3);
  const priorityValues = Array.from(
    { length: size },
    (_, index) => (index * 7) % 5,
  );
  let cursor = 0;
  effect(api, stats, () => {
    stats.checksum = summary.read();
  });
  return instance(
    stats,
    () => {
      const index = cursor++ % size;
      stateValues[index] = (stateValues[index] + 1) % 3;
      priorityValues[index] = (priorityValues[index] + 1) % 5;
      settle(api, () => {
        states[index].write(stateValues[index]);
        priorities[index].write(priorityValues[index]);
      });
    },
    () =>
      assertEqual(
        stats.checksum,
        stateValues.reduce(
          (total, state, index) =>
            total + (state === 1 ? priorityValues[index] + 1 : 0),
          0,
        ),
        "task-board",
      ),
    { productShaped: true, writesPerOperation: 2 },
  );
}

export const SCENARIOS = [
  { id: "changed-leaf", group: "common-path", sizes: [1], setup: changedLeaf },
  { id: "equal-leaf", group: "common-path", sizes: [1], setup: equalLeaf },
  {
    id: "equal-write-direct",
    group: "common-path",
    sizes: [1],
    setup: equalWriteDirect,
  },
  { id: "equal-result", group: "common-path", sizes: [1], setup: equalResult },
  {
    id: "changed-result",
    group: "common-path",
    sizes: [1],
    setup: changedResult,
  },
  {
    id: "clean-edge",
    group: "common-path",
    dimension: "depth",
    sizes: [1, 16, 256, 4096],
    setup: cleanEdge,
  },
  {
    id: "changed-chain",
    group: "scaling",
    dimension: "depth",
    sizes: [1, 16, 256, 4096, 16384],
    setup: changedChain,
  },
  {
    id: "deep-unknown",
    group: "common-path",
    dimension: "depth",
    sizes: [1, 16, 256, 4096],
    setup: deepUnknown,
  },
  {
    id: "wide-fanout",
    group: "scaling",
    dimension: "fan-out",
    sizes: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
    setup: wideFanout,
  },
  {
    id: "diamond-fan-in",
    group: "scaling",
    dimension: "fan-in",
    sizes: [2, 16, 256, 1024],
    setup: diamondFanIn,
  },
  {
    id: "layered-dag",
    group: "scaling",
    dimension: "width",
    sizes: [2, 8, 32, 128],
    setup: layeredDag,
  },
  {
    id: "selective-update",
    group: "selectivity",
    dimension: "nodes",
    sizes: [16, 256, 1024],
    setup: selectiveUpdate,
  },
  {
    id: "mostly-dirty",
    group: "selectivity",
    dimension: "nodes",
    sizes: [16, 256, 1024],
    setup: mostlyDirty,
    requiresCapabilities: ["publicBatch"],
  },
  {
    id: "semantic-noop-fanout",
    group: "selectivity",
    dimension: "fan-out",
    sizes: [1, 16, 256, 1024],
    setup: semanticNoopFanout,
  },
  {
    id: "dynamic-branch",
    group: "topology",
    dimension: "branches",
    sizes: [2, 16, 256, 1024],
    setup: dynamicBranch,
  },
  {
    id: "window-dependency-churn",
    group: "topology",
    dimension: "dependencies",
    sizes: [4, 16, 64, 256, 1024],
    setup: windowDependencyChurn,
    requiresCapabilities: ["publicBatch"],
  },
  {
    id: "reorder-dependencies",
    group: "topology",
    dimension: "dependencies",
    sizes: [8, 64, 512, 2048],
    setup: reorderDependencies,
  },
  {
    id: "effect-fanout",
    group: "scheduler",
    dimension: "observers",
    sizes: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
    setup: effectFanout,
  },
  {
    id: "effect-fanout-body",
    group: "scheduler",
    dimension: "body-iterations",
    sizes: [1, 4, 16, 64, 256, 1024],
    setup: effectFanoutBody,
  },
  {
    id: "lifecycle-churn",
    group: "lifecycle",
    dimension: "observers",
    sizes: [1, 16, 128, 512],
    setup: lifecycleChurn,
  },
  {
    id: "failure-retry",
    group: "failure",
    dimension: "depth",
    sizes: [1, 16, 256, 1024],
    setup: failureRetry,
  },
  {
    id: "task-board",
    group: "product",
    dimension: "tasks",
    sizes: [32, 256, 1024],
    setup: taskBoard,
    requiresCapabilities: ["publicBatch"],
  },
];

const scenariosById = new Map(
  SCENARIOS.map((scenario) => [scenario.id, scenario]),
);

export function getScenario(id) {
  const scenario = scenariosById.get(id);
  if (scenario === undefined) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
}

export function snapshotStats(stats) {
  return { ...stats };
}

export function subtractStats(after, before) {
  return Object.fromEntries(
    Object.keys(after)
      .filter((key) => key !== "checksum")
      .map((key) => [key, after[key] - before[key]]),
  );
}

export function normalizeStats(stats, operations) {
  return Object.fromEntries(
    Object.entries(stats).map(([key, value]) => [key, value / operations]),
  );
}
