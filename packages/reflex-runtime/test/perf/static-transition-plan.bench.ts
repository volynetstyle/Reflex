import { afterAll, bench, describe } from "vitest";
import {
  createConsumer,
  createProducer,
  createStaticTransitionPlan,
  createWatcher,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
  setInternalHooks,
  writeProducer,
  writeStaticPlanSource,
  type ReactiveNode,
  type StaticTransitionPlan,
} from "../runtime.test_utils";

const DEPTH = 64;
const WARMUP_ITERATIONS = 1_000;
const ITERATIONS = 10_000;

type BenchCase = {
  step(): void;
  dispose(): void;
  read(): number;
};

type GraphFactory = () => {
  source: ReactiveNode<number>;
  readObserved(): number;
};

function createChain(): ReturnType<GraphFactory> {
  const source = createProducer(0);
  let current = createConsumer(() => readProducer(source));

  for (let depth = 0; depth < DEPTH; depth++) {
    const previous = current;
    current = createConsumer(() => readConsumer(previous) + 1);
  }

  let observed = 0;
  const sink = createWatcher(() => {
    observed = readConsumer(current);
  });

  runWatcher(sink);

  return {
    source,
    readObserved: () => observed,
  };
}

function createDiamond(): ReturnType<GraphFactory> {
  const source = createProducer(0);
  const left = createConsumer(() => readProducer(source) + 1);
  const right = createConsumer(() => readProducer(source) + 2);
  const join = createConsumer(() => readConsumer(left) + readConsumer(right));

  let observed = 0;
  const sink = createWatcher(() => {
    observed = readConsumer(join);
  });

  runWatcher(sink);

  return {
    source,
    readObserved: () => observed,
  };
}

function createWideFanOut(): ReturnType<GraphFactory> {
  const source = createProducer(0);
  const leaves = Array.from({ length: 96 }, (_, index) =>
    createConsumer(() => readProducer(source) + index),
  );
  const join = createConsumer(() => {
    let total = 0;
    for (let i = 0; i < leaves.length; i++) total += readConsumer(leaves[i]!);
    return total;
  });

  let observed = 0;
  const sink = createWatcher(() => {
    observed = readConsumer(join);
  });

  runWatcher(sink);

  return {
    source,
    readObserved: () => observed,
  };
}

function createLayeredDag(): ReturnType<GraphFactory> {
  const source = createProducer(0);
  let layer = Array.from({ length: 16 }, (_, index) =>
    createConsumer(() => readProducer(source) + index),
  );

  for (let depth = 0; depth < 4; depth++) {
    const previous = layer;
    layer = Array.from({ length: 16 }, (_, index) => {
      const left = previous[index]!;
      const right = previous[(index + 1) % previous.length]!;
      return createConsumer(() => readConsumer(left) + readConsumer(right));
    });
  }

  const join = createConsumer(() => {
    let total = 0;
    for (let i = 0; i < layer.length; i++) total += readConsumer(layer[i]!);
    return total;
  });

  let observed = 0;
  const sink = createWatcher(() => {
    observed = readConsumer(join);
  });

  runWatcher(sink);

  return {
    source,
    readObserved: () => observed,
  };
}

function createDynamicCase(factory: GraphFactory): BenchCase {
  resetRuntime();
  setInternalHooks((node) => runWatcher(node));

  const graph = factory();
  let next = 0;

  return {
    step() {
      writeProducer(graph.source, ++next);
    },
    read() {
      return graph.readObserved();
    },
    dispose() {},
  };
}

function createStaticPlanCase(factory: GraphFactory): BenchCase {
  resetRuntime();
  setInternalHooks((node) => runWatcher(node));

  const graph = factory();
  const plan: StaticTransitionPlan = createStaticTransitionPlan([graph.source]);
  let next = 0;

  return {
    step() {
      const ok = writeStaticPlanSource(plan, graph.source, ++next);
      if (!ok) throw new Error("static transition plan deoptimized");
    },
    read() {
      return graph.readObserved();
    },
    dispose() {},
  };
}

function createBranchCase(switchEvery: number): BenchCase {
  resetRuntime();
  setInternalHooks((node) => runWatcher(node));

  const flag = createProducer(true);
  const left = createProducer(0);
  const right = createProducer(0);
  const selected = createConsumer(() =>
    readProducer(flag) ? readProducer(left) : readProducer(right),
  );

  let observed = 0;
  const sink = createWatcher(() => {
    observed = readConsumer(selected);
  });

  runWatcher(sink);

  let active = true;
  let next = 0;
  let step = 0;
  let plan = createStaticTransitionPlan([left]);

  return {
    step() {
      step += 1;

      if (switchEvery > 0 && step % switchEvery === 0) {
        active = !active;
        writeProducer(flag, active);
        writeProducer(active ? left : right, ++next);
        plan = createStaticTransitionPlan([active ? left : right]);
        return;
      }

      const ok = writeStaticPlanSource(plan, active ? left : right, ++next);
      if (!ok) {
        writeProducer(active ? left : right, next);
        plan = createStaticTransitionPlan([active ? left : right]);
      }
    },
    read() {
      return observed;
    },
    dispose() {},
  };
}

function validateCase(label: string, factory: () => BenchCase): void {
  const instance = factory();

  try {
    for (let i = 0; i < 8; i++) {
      instance.step();

      const expected = i + 1 + DEPTH;
      const actual = instance.read();

      if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`);
      }
    }
  } finally {
    instance.dispose();
  }
}

function registerCase(label: string, factory: () => BenchCase): void {
  let instance: BenchCase | null = null;

  describe(label, () => {
    afterAll(() => {
      instance?.dispose();
      instance = null;
    });

    bench(
      "write + settle",
      () => {
        instance ??= factory();
        instance.step();
      },
      {
        warmupIterations: WARMUP_ITERATIONS,
        iterations: ITERATIONS,
      },
    );
  });
}

validateCase("dynamic topology chain", () => createDynamicCase(createChain));
validateCase("static transition plan chain", () =>
  createStaticPlanCase(createChain),
);

for (const [label, factory] of [
  ["linear chain", createChain],
  ["diamond", createDiamond],
  ["wide fan-out/fan-in", createWideFanOut],
  ["layered DAG", createLayeredDag],
] as const) {
  registerCase(`runtime topology | dynamic propagation | ${label}`, () =>
    createDynamicCase(factory),
  );
  registerCase(`runtime topology | static transition plan | ${label}`, () =>
    createStaticPlanCase(factory),
  );
}

registerCase("runtime deopt | branch stable 99%", () => createBranchCase(100));
registerCase("runtime deopt | branch switches 10%", () => createBranchCase(10));
registerCase("runtime deopt | branch switches 50%", () => createBranchCase(2));
