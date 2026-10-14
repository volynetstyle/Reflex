import { beforeEach, describe, expect, it } from "vitest";
import {
  Changed,
  createConsumer,
  createProducer,
  readConsumer,
  readProducer,
  resetRuntime,
  Unknown,
  Visited,
  writeProducer,
} from "../../runtime.test_utils";

/**
 * Characterization of baseline behavior that the semantic contract leaves
 * open (docs/characterization/SEMANTIC_CHARACTERIZATION.md). These tests pin
 * what the runtime does; they do not declare it correct.
 */
describe("Reactive runtime - characterization of open contract regions", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("F1: a computed drops invalidation of an already-read source during its own evaluation", () => {
    const source = createProducer(0);
    let runs = 0;
    const computed = createConsumer(() => {
      runs++;
      const value = readProducer(source);
      if (value === 0) writeProducer(source, 1);
      return value;
    });

    expect(readConsumer(computed)).toBe(0);
    expect(computed.state & (Changed | Unknown | Visited)).toBe(0);
    expect(readConsumer(computed)).toBe(0);
    expect(source.payload).toBe(1);
    expect(runs).toBe(1);
  });
});
