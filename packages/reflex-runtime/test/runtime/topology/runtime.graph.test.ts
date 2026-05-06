import { beforeEach, describe, expect, it } from "vitest";
import { disposeNode, readConsumer, readProducer, writeProducer } from "../../runtime.test_utils";
import {
  createConsumer,
  createProducer,
  scenario,
  expectGraph,
  expectGraphIntegrity,
  expectNodeGraphIntegrity,
  expectNoSubscriber,
  expectSources,
  expectSubscriber,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers graph-shape invariants that should hold after ordinary runtime use. */
describe("Reactive runtime - graph topology and consistency", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("keeps incoming and outgoing chains bidirectionally consistent after initial tracking", () => {
    const source = createProducer(1);
    const middle = createConsumer(() => readProducer(source) * 2);
    const sink = createConsumer(() => readConsumer(middle) + 1);

    expect(readConsumer(sink)).toBe(3);

    expectGraphIntegrity([source, middle, sink]);
    expectSubscriber(source, middle);
    expectSubscriber(middle, sink);
    expectSources(sink, [middle]);
  });

  it("preserves chain integrity when a branch switch prunes a stale suffix", () => {
    const graph = scenario.branchSwitch({ gate: true, left: 1, right: 10 });

    expect(readConsumer(graph.selected)).toBe(1);
    writeProducer(graph.gate, false);

    expect(readConsumer(graph.selected)).toBe(10);
    expectSources(graph.selected, [graph.gate, graph.right]);
    expectNoSubscriber(graph.left, graph.selected);

    expectGraph(graph).toBeBidirectional();
  });

  it("removes both sides of the edge when an intermediate consumer is disposed", () => {
    const source = createProducer(1);
    const middle = createConsumer(() => readProducer(source) * 2);
    const sink = createConsumer(() => readConsumer(middle) + 1);

    expect(readConsumer(sink)).toBe(3);
    disposeNode(middle);

    expectNoSubscriber(source, middle);
    expectNoSubscriber(middle, sink);
    expectSources(middle, []);
    expectSources(sink, []);

    expectNodeGraphIntegrity(source);
    expectNodeGraphIntegrity(middle);
    expectNodeGraphIntegrity(sink);
  });

  it("reuses dependency edges without creating duplicate incoming links", () => {
    const source = createProducer(2);
    const consumer = createConsumer(
      () => readProducer(source) + readProducer(source),
    );

    expect(readConsumer(consumer)).toBe(4);
    expect(readConsumer(consumer)).toBe(4);

    expectSources(consumer, [source]);
    expectNodeGraphIntegrity(source);
    expectNodeGraphIntegrity(consumer);
  });

  it("keeps repeated branch reads deduped while alternating computed dependencies", () => {
    const head = createProducer(0);
    const double = createConsumer(() => readProducer(head) * 2);
    const inverse = createConsumer(() => -readProducer(head));
    const current = createConsumer(() => {
      let result = 0;

      for (let i = 0; i < 20; i += 1) {
        result +=
          readProducer(head) % 2 ? readConsumer(double) : readConsumer(inverse);
      }

      return result;
    });

    expect(readConsumer(current)).toBe(0);
    expectSources(current, [head, inverse]);
    expectNoSubscriber(double, current);

    for (let value = 1; value < 6; value += 1) {
      writeProducer(head, value);

      const expected = value % 2 === 1 ? value * 40 : -value * 20;
      const activeBranch = value % 2 === 1 ? double : inverse;
      const staleBranch = value % 2 === 1 ? inverse : double;

      expect(readConsumer(current)).toBe(expected);
      expectSources(current, [head, activeBranch]);
      expectSubscriber(activeBranch, current);
      expectNoSubscriber(staleBranch, current);

      expectNodeGraphIntegrity(head);
      expectNodeGraphIntegrity(double);
      expectNodeGraphIntegrity(inverse);
      expectNodeGraphIntegrity(current);
    }
  });
});



