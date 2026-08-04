import { describe, expect, it } from "vitest";
import {
  createConsumer,
  createProducer,
  createWatcher,
  disposeWatcher,
  readConsumer,
  readProducer,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
} from "../../../src";

const COUNT = 32;

type CallbackVariant = "capture-index" | "factory" | "copied-value";

function createIndexedConsumers(variant: CallbackVariant) {
  resetRuntimeContext();
  const source = createProducer(0);
  const consumers = [];

  for (let index = 0; index < COUNT; index += 1) {
    const callback =
      variant === "factory"
        ? createIndexedCallback(source, index)
        : variant === "copied-value"
          ? createCopiedCallback(source, index)
          : () => readProducer(source) + index;
    consumers.push(createConsumer(callback));
  }

  return { source, consumers };
}

function createIndexedCallback(
  source: ReturnType<typeof createProducer>,
  index: number,
) {
  return () => readProducer(source) + index;
}

function createCopiedCallback(
  source: ReturnType<typeof createProducer>,
  index: number,
) {
  const itemIndex = index;
  return () => readProducer(source) + itemIndex;
}

function readAll(
  consumers: ReturnType<typeof createIndexedConsumers>["consumers"],
): number {
  return consumers.reduce((sum, consumer) => sum + readConsumer(consumer), 0);
}

describe("callback-heavy runtime semantic guardrails", () => {
  it.each(["capture-index", "factory", "copied-value"] as const)(
    "preserves per-node index semantics for %s callbacks",
    (variant) => {
      const { source, consumers } = createIndexedConsumers(variant);

      expect(consumers.map((consumer) => readConsumer(consumer))).toEqual(
        Array.from({ length: COUNT }, (_, index) => index),
      );
      expect(readAll(consumers)).toBe((COUNT * (COUNT - 1)) / 2);

      writeProducer(source, 1);
      expect(readAll(consumers)).toBe(COUNT + (COUNT * (COUNT - 1)) / 2);
    },
  );

  it("keeps watcher cleanup and disposal observable after recomputation", () => {
    resetRuntimeContext();
    const source = createProducer(0);
    let cleanupCalls = 0;
    const watchers = Array.from({ length: COUNT }, (_, index) =>
      createWatcher(() => {
        readProducer(source);
        return () => {
          cleanupCalls += 1;
          if (index < 0) throw new Error("unreachable");
        };
      }),
    );

    watchers.forEach(runWatcher);
    writeProducer(source, 1);
    watchers.forEach(runWatcher);
    watchers.forEach(disposeWatcher);

    expect(cleanupCalls).toBe(COUNT * 2);
  });
});
