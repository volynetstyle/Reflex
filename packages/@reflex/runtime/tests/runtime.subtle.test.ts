import { beforeEach, describe, expect, it } from "vitest";
import {
  readConsumer,
  readProducer,
  runWatcher,
  subtle,
  untracked,
} from "../src";
import {
  createConsumer,
  createProducer,
  createWatcher,
  hasSubscriber,
  incomingSources,
  resetRuntime,
} from "./runtime.test_utils";

describe("Reactive runtime - subtle debug surface", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("exposes untrack as a subtle alias", () => {
    const source = createProducer(1);
    const consumer = createConsumer(() => subtle.untrack(() => readProducer(source)));

    readConsumer(consumer);

    expect(incomingSources(consumer)).toEqual([]);
    expect(hasSubscriber(source, consumer)).toBe(false);
  });

  it("reports the current computed while a computed is evaluating", () => {
    const source = createProducer(2);
    let current = undefined;

    const consumer = createConsumer(() => {
      current = subtle.currentComputed();
      return readProducer(source) * 2;
    });

    expect(subtle.currentComputed()).toBeUndefined();
    readConsumer(consumer);

    expect(current).toBe(consumer);
    expect(subtle.currentComputed()).toBeUndefined();
  });

  it("introspects sources and sinks in graph order", () => {
    const a = createProducer(1);
    const b = createProducer(2);
    const sum = createConsumer(() => readProducer(a) + readProducer(b));
    const watcher = createWatcher(() => {
      readConsumer(sum);
    });

    readConsumer(sum);
    expect(subtle.introspectSources(sum)).toEqual([a, b]);
    expect(subtle.introspectSinks(a)).toEqual([sum]);
    expect(subtle.hasSources(sum)).toBe(true);
    expect(subtle.hasSinks(a)).toBe(true);
    runWatcher(watcher);
    expect(subtle.introspectSinks(sum)).toEqual([watcher]);
  });

  it("reports watcher sinks and nodes without dependencies", () => {
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
      return () => {};
    });

    expect(subtle.hasSinks(source)).toBe(false);
    expect(subtle.hasSources(watcher)).toBe(false);

    runWatcher(watcher);

    expect(subtle.introspectSinks(source)).toEqual([watcher]);
    expect(subtle.hasSinks(source)).toBe(true);
    expect(subtle.hasSources(watcher)).toBe(true);
  });

  it("matches the standalone untracked helper", () => {
    const source = createProducer(10);

    expect(subtle.untrack(() => readProducer(source))).toBe(
      untracked(() => readProducer(source)),
    );
  });
});
