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
});
