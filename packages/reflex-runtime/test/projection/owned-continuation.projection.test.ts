import { expect, it } from "vitest";

import {
  createConsumer,
  createProducer,
  profileRuntime,
  readConsumer,
  readProducer,
  resetRuntime,
  writeProducer,
} from "../runtime.test_utils";

it("elides propagation along stable edges owned by the active continuation", () => {
  const width = 16;
  resetRuntime();

  const source = createProducer(0);
  const leaves = Array.from({ length: width }, (_, index) =>
    createConsumer(() => readProducer(source) + index),
  );
  const root = createConsumer(() => {
    let total = 0;
    for (const leaf of leaves) total += readConsumer(leaf);
    return total;
  });

  readConsumer(root);

  const { counters } = profileRuntime(() => {
    writeProducer(source, 1);
    return readConsumer(root);
  });

  expect(counters.pushDirectEdgesVisited).toBe(width);
  expect(counters.pushTransitiveEdgesVisited).toBe(width);
  expect(counters.pushOnceEdgesVisited).toBe(0);
  expect(counters.advanceOwnedEdgeOnlySkipped).toBe(width);
});

it("falls back to generic propagation when dependency order changes", () => {
  resetRuntime();

  const selector = createProducer(0);
  const leftSource = createProducer(0);
  const rightSource = createProducer(0);
  const left = createConsumer(() => readProducer(leftSource));
  const right = createConsumer(() => readProducer(rightSource));
  const root = createConsumer(() => {
    const reversed = readProducer(selector) !== 0;
    return reversed
      ? readConsumer(right) + readConsumer(left)
      : readConsumer(left) + readConsumer(right);
  });

  readConsumer(root);

  const { counters } = profileRuntime(() => {
    writeProducer(rightSource, 1);
    writeProducer(selector, 1);
    return readConsumer(root);
  });

  expect(counters.pushOnceEdgesVisited).toBeGreaterThan(0);
  expect(counters.advanceOwnedEdgeOnlySkipped).toBe(0);
});
