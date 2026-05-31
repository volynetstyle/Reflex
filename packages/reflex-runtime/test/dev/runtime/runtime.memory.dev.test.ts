import { describe, expect, it } from "vitest";
import { readConsumer, readProducer, writeProducer } from "../../../src";
import { subtle } from "../../../src/debug";
import {
  createConsumer,
  createProducer,
  resetState,
} from "../../runtime.test_utils";

/** Covers dev-only memory guardrails for debug history and walker stack stats. */
describe.skipIf(!subtle.enabled)(
  "Reactive runtime - dev memory guardrails",
  () => {
    it("returns should-recompute stack capacity to the dev floor after a deep pull", () => {
      resetState();
      subtle.resetStackStats();

      const source = createProducer(0);
      let current = createConsumer(() => readProducer(source));

      for (let i = 0; i < 320; i++) {
        const previous = current;
        current = createConsumer(() => readConsumer(previous) + 1);
      }

      expect(readConsumer(current)).toBe(320);
      writeProducer(source, 1);
      expect(readConsumer(current)).toBe(321);

      const stats = subtle.stackStats();

      expect(stats?.shouldRecompute.peak).toBeGreaterThanOrEqual(256);
      expect(stats?.shouldRecompute.current).toBe(0);
      expect(stats?.shouldRecompute.capacity).toBe(256);
    });

    it("keeps debug history bounded under sustained runtime events", () => {
      resetState();
      subtle.configure({ historyLimit: 32 });
      subtle.clearHistory();

      const source = createProducer(0);
      const consumer = createConsumer(() => readProducer(source) + 1);

      readConsumer(consumer);

      for (let i = 1; i <= 512; i++) {
        writeProducer(source, i);
        readConsumer(consumer);
      }

      expect(subtle.context()?.historySize).toBe(32);
      expect(subtle.history()).toHaveLength(32);
    });
  },
);
