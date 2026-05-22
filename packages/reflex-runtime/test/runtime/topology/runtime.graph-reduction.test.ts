import { beforeEach, describe, expect, it } from "vitest";
import {
  createConsumer,
  createExecutionState,
  createProducer,
  getGraphReductionState,
  readConsumer,
  readProducer,
  resetRuntime,
  runWithExecutionState,
  writeProducer,
} from "../../runtime.test_utils";

describe("Reactive runtime - graph reduction", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("promotes stable dependency order through reduction modes", () => {
    const execution = createExecutionState({
      graphReduction: {
        enabled: true,
        stableThreshold: 2,
        specializeThreshold: 3,
        staticPlanThreshold: 4,
      },
    });
    const left = createProducer(1);
    const right = createProducer(2);
    const total = createConsumer(
      () => readProducer(left) + readProducer(right),
    );

    runWithExecutionState(execution, () => {
      expect(readConsumer(total)).toBe(3);
      expect(getGraphReductionState(total)?.mode).toBe("dynamic");

      writeProducer(left, 2);
      expect(readConsumer(total)).toBe(4);
      expect(getGraphReductionState(total)?.mode).toBe("stabilized");

      writeProducer(right, 3);
      expect(readConsumer(total)).toBe(5);
      expect(getGraphReductionState(total)?.mode).toBe("specialized");

      writeProducer(left, 4);
      expect(readConsumer(total)).toBe(7);
      expect(getGraphReductionState(total)?.mode).toBe(
        "static-transition-plan",
      );
    });
  });

  it("deoptimizes when dependency topology changes", () => {
    const execution = createExecutionState({
      graphReduction: {
        enabled: true,
        stableThreshold: 2,
        specializeThreshold: 2,
      },
    });
    const flag = createProducer(true);
    const left = createProducer(1);
    const right = createProducer(10);
    const selected = createConsumer(() =>
      readProducer(flag) ? readProducer(left) : readProducer(right),
    );

    runWithExecutionState(execution, () => {
      expect(readConsumer(selected)).toBe(1);
      writeProducer(left, 2);
      expect(readConsumer(selected)).toBe(2);
      expect(getGraphReductionState(selected)?.mode).toBe("specialized");

      writeProducer(flag, false);
      expect(readConsumer(selected)).toBe(10);

      expect(getGraphReductionState(selected)).toMatchObject({
        mode: "dynamic",
        deoptCount: 1,
        topologyVersion: 1,
        cooldownRuns: 16,
      });
    });
  });

  it("keeps a branch in cooldown after deopt until stability returns", () => {
    const execution = createExecutionState({
      graphReduction: {
        enabled: true,
        stabilizeAfter: 2,
        specializeThreshold: 2,
        staticPlanThreshold: 3,
        cooldownAfterDeopt: 2,
      },
    });
    const flag = createProducer(true);
    const left = createProducer(1);
    const right = createProducer(10);
    const selected = createConsumer(() =>
      readProducer(flag) ? readProducer(left) : readProducer(right),
    );

    runWithExecutionState(execution, () => {
      expect(readConsumer(selected)).toBe(1);
      writeProducer(left, 2);
      expect(readConsumer(selected)).toBe(2);
      expect(getGraphReductionState(selected)?.mode).toBe("specialized");

      writeProducer(flag, false);
      expect(readConsumer(selected)).toBe(10);
      expect(getGraphReductionState(selected)).toMatchObject({
        mode: "dynamic",
        cooldownRuns: 2,
      });

      writeProducer(right, 11);
      expect(readConsumer(selected)).toBe(11);
      expect(getGraphReductionState(selected)).toMatchObject({
        mode: "dynamic",
        cooldownRuns: 1,
      });

      writeProducer(right, 12);
      expect(readConsumer(selected)).toBe(12);
      expect(getGraphReductionState(selected)).toMatchObject({
        mode: "specialized",
        cooldownRuns: 0,
      });
    });
  });
});
