import { describe, expect, it } from "vitest";
import {
  createEquivalentCascade,
  createKeyedLocality,
  executionAmplification,
} from "../bench/semantic-workloads";

describe("semantic workload instrumentation", () => {
  it("shows the equivalent-change cascade and both semantic cutoffs", () => {
    const identity = createEquivalentCascade({ strategy: "identity", fields: 16, consumers: 64 });
    const deep = createEquivalentCascade({ strategy: "deep", fields: 16, consumers: 64 });
    const projection = createEquivalentCascade({ strategy: "projection", fields: 16, consumers: 64 });

    identity.update(true);
    deep.update(true);
    projection.update(true);

    expect(identity.metrics.consumerExecutions).toBe(64);
    expect(deep.metrics.consumerExecutions).toBe(0);
    expect(deep.metrics.equalityCalls).toBe(1);
    expect(deep.metrics.equalityFieldsVisited).toBe(16);
    expect(projection.metrics.consumerExecutions).toBe(0);

    identity.dispose();
    deep.dispose();
    projection.dispose();
  });

  it("reports execution amplification for generic and keyed invalidation", () => {
    const generic = createKeyedLocality({ keys: 100, consumersPerKey: 2, selector: false });
    const selector = createKeyedLocality({ keys: 100, consumersPerKey: 2, selector: true });

    generic.update(false);
    selector.update(false);

    expect(executionAmplification(generic.metrics)).toBe(50);
    expect(executionAmplification(selector.metrics)).toBe(1);

    generic.dispose();
    selector.dispose();
  });
});
