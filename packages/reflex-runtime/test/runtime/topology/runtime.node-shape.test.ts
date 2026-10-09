import { beforeEach, describe, expect, it } from "vitest";
import {
  createConsumer,
  createProducer,
  createWatcher,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
  writeProducer,
} from "../../runtime.test_utils";

describe("node role shape stability", () => {
  beforeEach(() => resetRuntime());

  it("keeps each role's own fields stable through creation and execution", () => {
    const source = createProducer(0);
    const computed = createConsumer(() => readProducer(source));
    const watcher = createWatcher(() => {
      readConsumer(computed);
      return () => undefined;
    });
    const nodes = [source, computed, watcher];
    const initialKeys = nodes.map((node) => Object.keys(node));

    expect(Object.keys(createProducer(1))).toEqual(initialKeys[0]);
    expect(Object.keys(createConsumer(() => 1))).toEqual(initialKeys[1]);
    expect(Object.keys(createWatcher(() => undefined))).toEqual(initialKeys[2]);

    expect(readConsumer(computed)).toBe(0);
    runWatcher(watcher);
    writeProducer(source, 1);
    expect(readConsumer(computed)).toBe(1);
    runWatcher(watcher);

    nodes.forEach((node, index) => {
      expect(Object.keys(node)).toEqual(initialKeys[index]);
    });
  });
});
