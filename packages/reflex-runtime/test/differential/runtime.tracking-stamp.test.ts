import { beforeEach, describe, expect, it } from "vitest";
import {
  createConsumer,
  createProducer,
  readConsumer,
  readProducer,
  resetRuntimeContext,
  setTrackingEpoch,
  trackingEpoch,
  writeProducer,
} from "../../src/internal";

describe("generation witness limits", () => {
  beforeEach(resetRuntimeContext);

  it("does not confuse a tracking stamp with producer value freshness", () => {
    const source = createProducer(1);
    const derived = createConsumer(() => readProducer(source));

    setTrackingEpoch(0xfffffffe);
    expect(readConsumer(derived)).toBe(1);
    const edge = derived.firstIn!;
    expect(edge.version >>> 0).toBe(0xffffffff);

    writeProducer(source, 2);
    expect(edge.version >>> 0).toBe(0xffffffff);
    expect(readConsumer(derived)).toBe(2);
    expect(trackingEpoch).toBe(1);
    expect(edge.version >>> 0).toBe(1);
  });

  it("keeps the outer tracking stamp across nested computation", () => {
    const source = createProducer(2);
    const nested = createConsumer(() => readProducer(source) * 2);
    const outer = createConsumer(() => {
      const first = readProducer(source);
      const middle = readConsumer(nested);
      const duplicate = readProducer(source);
      return first + middle + duplicate;
    });

    expect(readConsumer(outer)).toBe(8);
    const outerStamp = outer.firstIn!.version;
    expect(outer.firstIn!.nextIn!.version).toBe(outerStamp);

    writeProducer(source, 3);
    expect(readConsumer(outer)).toBe(12);
    expect(outer.firstIn!.version).toBe(outer.firstIn!.nextIn!.version);
  });

  // Epochs are uint32. A pass that both reuses an edge (stamped with the raw
  // epoch) and links a new one must stamp both identically; otherwise, past
  // 2^31, the version fallback of the bounded prefix scan misses a duplicate
  // read beyond 32 edges and links a second edge between the same nodes.
  it.each([1_000, 0x7ffffff0, 0xfffffff0])(
    "keeps one stamp per pass and no duplicate edge from epoch %i",
    (epoch) => {
      const shared = createProducer(0);
      const sources = Array.from({ length: 40 }, (_, i) => createProducer(i));
      const added = createProducer(-1);
      let addDependency = false;
      const derived = createConsumer(() => {
        let sum = readProducer(shared);
        if (addDependency) sum += readProducer(added);
        for (const source of sources) sum += readProducer(source);
        return sum + readProducer(shared);
      });
      // A second subscriber keeps the outgoing-list shortcuts inconclusive.
      readConsumer(createConsumer(() => readProducer(shared)));
      readConsumer(derived);

      setTrackingEpoch(epoch);
      addDependency = true;
      writeProducer(sources[5]!, 100);
      readConsumer(derived);

      const edges = [];
      for (let edge = derived.firstIn; edge !== null; edge = edge.nextIn) {
        edges.push(edge);
      }
      expect(edges).toHaveLength(42);
      expect(new Set(edges.map((edge) => edge.from)).size).toBe(42);
      expect(new Set(edges.map((edge) => edge.version)).size).toBe(1);
    },
  );
});
