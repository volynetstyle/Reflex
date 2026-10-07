import { describe, expect, it } from "vitest";
import { profileRuntime } from "@volynets/reflex-runtime/debug";
import {
  createEquivalentCascade,
  createKeyedLocality,
} from "../bench/semantic-workloads";

describe("semantic workload runtime topology", () => {
  it("distinguishes conservative lazy invalidation from downstream execution", () => {
    const identity = createEquivalentCascade({
      strategy: "identity",
      fields: 16,
      consumers: 64,
    });
    const identityProfile = profileRuntime(() => identity.update(true));
    const projection = createEquivalentCascade({
      strategy: "projection",
      fields: 16,
      consumers: 64,
    });
    const projectionProfile = profileRuntime(() => projection.update(true));

    // A lazy equality boundary cannot know the result during push. Both frontiers
    // may be invalidated, but only the identity boundary executes user effects.
    expect(identityProfile.counters.pushWatchersInvalidated).toBe(64);
    expect(projectionProfile.counters.pushWatchersInvalidated).toBe(64);
    expect(identity.metrics.consumerExecutions).toBe(64);
    expect(projection.metrics.consumerExecutions).toBe(0);
    expect(projection.metrics.producerRecomputes).toBe(1);
    expect(
      projectionProfile.counters.pushTransitiveEdgesVisited,
    ).toBeGreaterThan(0);
    expect(projectionProfile.topology.push.maxDepth).toBeGreaterThan(0);
    identity.dispose();
    projection.dispose();
  });

  it("routes selector invalidation only to the old and new observed keys", () => {
    const generic = createKeyedLocality({
      keys: 100,
      consumersPerKey: 2,
      selector: false,
    });
    const selector = createKeyedLocality({
      keys: 100,
      consumersPerKey: 2,
      selector: true,
    });
    const genericProfile = profileRuntime(() => generic.update(false));
    const selectorProfile = profileRuntime(() => selector.update(false));
    expect(genericProfile.counters.pushWatchersInvalidated).toBe(200);
    expect(selectorProfile.counters.pushWatchersInvalidated).toBe(5); // Router + four consumers.
    expect(selector.metrics.consumerExecutions).toBe(4);
    generic.dispose();
    selector.dispose();
  });
});
