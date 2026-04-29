import { describe, expect, it, vi } from "vitest";
import {
  Changed,
  ConsumerReadMode,
  Invalid,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../src";
import { subtle } from "../src/debug";
import {
  createConsumer,
  createProducer,
  createWatcher,
  expectClean,
  expectGraph,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - state and read-mode matrices", () => {
  it.each([
    {
      name: "direct consumer subscriber becomes Changed",
      build() {
        const source = createProducer(1);
        const target = createConsumer(() => readProducer(source));
        readConsumer(target);
        return { source, target, expected: Changed };
      },
    },
    {
      name: "transitive consumer subscriber becomes Invalid",
      build() {
        const source = createProducer(1);
        const middle = createConsumer(() => readProducer(source));
        const target = createConsumer(() => readConsumer(middle));
        readConsumer(target);
        return { source, target, expected: Invalid };
      },
    },
    {
      name: "direct watcher subscriber becomes Changed",
      build() {
        const source = createProducer(1);
        const target = createWatcher(() => {
          readProducer(source);
        });
        runWatcher(target);
        return { source, target, expected: Changed };
      },
    },
  ])("$name", ({ build }) => {
    resetRuntime();
    const { source, target, expected } = build();

    writeProducer(source, 2);

    expect(target.state & expected).toBeTruthy();
  });

  it.each([
    {
      name: "lazy read subscribes the observer",
      read<T>(node: Parameters<typeof readConsumer<T>>[0]): T {
        return readConsumer(node);
      },
      expectedSubscriber: true,
    },
    {
      name: "eager read does not subscribe the observer",
      read<T>(node: Parameters<typeof readConsumer<T>>[0]): T {
        return readConsumer(node, ConsumerReadMode.eager);
      },
      expectedSubscriber: false,
    },
    {
      name: "untracked read does not subscribe the observer",
      read<T>(node: Parameters<typeof readConsumer<T>>[0]): T {
        return subtle.untrack(() => readConsumer(node));
      },
      expectedSubscriber: false,
    },
  ])("$name", ({ read, expectedSubscriber }) => {
    resetRuntime();
    const source = createProducer(1);
    const derived = createConsumer(() => readProducer(source) * 2);
    const observerSpy = vi.fn(() => read(derived) + 1);
    const observer = createConsumer(observerSpy);

    expect(readConsumer(observer)).toBe(3);

    if (expectedSubscriber) {
      expectGraph([derived, observer]).toHaveSubscriber(derived, observer);
    } else {
      expectGraph([derived, observer]).toHaveNoSubscriber(derived, observer);
    }

    writeProducer(source, 2);

    if (expectedSubscriber) {
      expect(observer.state & Invalid).toBeTruthy();
    } else {
      expectClean(observer);
    }
  });
});
