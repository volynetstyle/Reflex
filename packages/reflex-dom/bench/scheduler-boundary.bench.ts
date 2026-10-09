import { bench, describe } from "vitest";
import {
  createProducer,
  createWatcher,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime";
import { createRendererRuntime } from "../src/runtime/options";

const noop = (): void => {};

describe("runtime / scheduler / DOM boundary tax", () => {
  let runtime: ReturnType<typeof createRendererRuntime>;
  let source: ReturnType<typeof createProducer<number>>;
  let nextValue: number;

  bench("empty eager batch", () => runtime.batch(noop), {
    setup() {
      runtime = createRendererRuntime({ effectStrategy: "eager" });
    },
  });

  bench("empty flush batch", () => runtime.batch(noop), {
    setup() {
      runtime = createRendererRuntime({ effectStrategy: "flush" });
    },
  });

  bench("one eager watcher update in batch", () => {
    runtime.batch(() => writeProducer(source, ++nextValue));
  }, {
    setup() {
      runtime = createRendererRuntime({ effectStrategy: "eager" });
      source = runtime.run(() => createProducer(0));
      const watcher = runtime.run(() =>
        createWatcher(() => readProducer(source)),
      );
      runtime.run(() => runWatcher(watcher));
      nextValue = 0;
    },
  });
});
