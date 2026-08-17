import { describe, expect, it } from "vitest";
import { profileRuntime } from "@volynets/reflex-runtime/debug";
import { createEquivalentCascade } from "../bench/semantic-workloads";

describe("semantic workload runtime topology", () => {
  it("measures visited edges, dirty nodes, executions, and propagation depth", () => {
    const identity = createEquivalentCascade({ strategy: "identity", fields: 16, consumers: 64 });
    const identityProfile = profileRuntime(() => identity.update(true));
    identity.dispose();

    const projection = createEquivalentCascade({ strategy: "projection", fields: 16, consumers: 64 });
    const projectionProfile = profileRuntime(() => projection.update(true));

    expect(identityProfile.counters.pushWatchersInvalidated).toBe(64);
    expect(projectionProfile.counters.pushWatchersInvalidated).toBe(1);
    expect(identityProfile.counters.pushTransitiveEdgesVisited).toBeGreaterThan(
      projectionProfile.counters.pushTransitiveEdgesVisited,
    );
    expect(identityProfile.topology.push.maxDepth).toBeGreaterThanOrEqual(
      projectionProfile.topology.push.maxDepth,
    );

    projection.dispose();
  });
});
