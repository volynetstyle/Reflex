import { describe, expect, it, vi } from "vitest";
import {
  Changed,
  Computing,
  ConsumerReadMode,
  DIRTY_STATE,
  Unknown,
  Visited,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "../../runtime.test_utils";
import { subtle } from "../../../src/debug";
import {
  createConsumer,
  createProducer,
  createWatcher,
  expectChanged,
  expectClean,
  expectGraph,
  expectInvalid,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers state-bit and read-mode matrices across the main subscriber kinds. */
describe("Reactive runtime - state and read-mode matrices", () => {
  const TRANSIENT_RECOMPUTE_STATE = Computing | Visited | DIRTY_STATE;

  it.each([
    {
      name: "changed refresh",
      next: 2,
    },
    {
      name: "unchanged refresh",
      next: 1,
    },
  ])("clears transient state after a successful $name", ({ next }) => {
    resetRuntime();
    const source = createProducer(1);
    const derived = createConsumer(() => readProducer(source));

    expect(readConsumer(derived)).toBe(1);
    expect(derived.state & TRANSIENT_RECOMPUTE_STATE).toBe(0);

    writeProducer(source, next);
    expect(readConsumer(derived)).toBe(next);
    expect(derived.state & TRANSIENT_RECOMPUTE_STATE).toBe(0);
  });

  it("propagates a later change after an unchanged dynamic refresh", () => {
    resetRuntime();
    const selector = createProducer(0);
    const left = createProducer(1);
    const right = createProducer(1);
    const selected = createConsumer(() =>
      readProducer(selector) % 2 === 0
        ? readProducer(left)
        : readProducer(right),
    );
    const downstream = createConsumer(() => readConsumer(selected) + 1);

    expect(readConsumer(downstream)).toBe(2);

    writeProducer(selector, 1);
    expect(readConsumer(downstream)).toBe(2);
    expect(selected.state & TRANSIENT_RECOMPUTE_STATE).toBe(0);

    writeProducer(right, 2);
    expect(readConsumer(downstream)).toBe(3);
    expect(selected.state & TRANSIENT_RECOMPUTE_STATE).toBe(0);
    expect(downstream.state & TRANSIENT_RECOMPUTE_STATE).toBe(0);
  });

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
      name: "transitive consumer subscriber becomes Unknown",
      build() {
        const source = createProducer(1);
        const middle = createConsumer(() => readProducer(source));
        const target = createConsumer(() => readConsumer(middle));
        readConsumer(target);
        return { source, target, expected: Unknown };
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

    if (expected === Changed) expectChanged(target);
    if (expected === Unknown) expectInvalid(target);
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
      expectInvalid(observer);
    } else {
      expectClean(observer);
    }
  });
});



