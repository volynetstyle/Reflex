import { beforeEach, describe, expect, it } from "vitest";

import {
  Consumer,
  Producer,
  ReactiveNode,
  configureRuntimeContext,
  linkEdge,
  resolveTrackedRead,
  setTrackingEpoch,
} from "../../../src/kernel";
import {
  expectGraphIntegrity,
  expectIncomingEdges,
  expectOutgoingEdges,
  expecttailIn,
  resetRuntime,
} from "../../runtime.test_utils";

import {
  createConsumer,
  createProducer,
} from "../../../src/protocol/create.node";
import { readConsumer } from "../../../src/protocol/read.consumer";
import { readProducer } from "../../../src/protocol/read.producer";
import { writeProducer } from "../../../src/protocol/write.producer";
import {
  incomingEdges,
  outgoingEdges,
} from "../../tools/graph/graph-inspector";

function createProducerNode(): ReactiveNode {
  return new ReactiveNode(undefined, null, Producer);
}

function createConsumerNode(): ReactiveNode {
  return new ReactiveNode(undefined, null, Consumer);
}

function forbidSlowPath(): void {
  configureRuntimeContext({
    readTrackingStrategy() {
      throw new Error("tracking slow path must not run");
    },
  });
}

/** Covers resolver tiers whose final graph shape can otherwise hide fallback. */
describe("Reactive runtime - tracking resolver matrix", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("reuses a two-hop edge without entering the slow path", () => {
    forbidSlowPath();

    const sources = Array.from({ length: 5 }, createProducerNode);
    const target = createConsumerNode();
    const edges = sources.map((source) =>
      linkEdge(source, target, target.lastIn, 1),
    );
    const [firstEdge, expectedEdge, lookaheadEdge, movedEdge, lastEdge] = edges;

    // The cursor was accepted in this pass, so it carries the pass stamp.
    target.tailIn = firstEdge!;
    firstEdge!.version = 17;

    resolveTrackedRead(sources[3]!, target);
    expectIncomingEdges(target, [
      firstEdge!,
      movedEdge!,
      expectedEdge!,
      lookaheadEdge!,
      lastEdge!,
    ]);
    expecttailIn(target, movedEdge!);
    expect(movedEdge!.version).toBe(17);
    expectOutgoingEdges(sources[3]!, [movedEdge!]);
    expectGraphIntegrity([...sources, target]);
  });

  it("moves the previous incoming tail to the front on an initial read", () => {
    forbidSlowPath();

    const sources = Array.from({ length: 4 }, createProducerNode);
    const target = createConsumerNode();
    const edges = sources.map((source) =>
      linkEdge(source, target, target.lastIn, 2),
    );
    const [firstEdge, secondEdge, thirdEdge, movedEdge] = edges;

    expecttailIn(target, null);
    // A first read stamps with the current epoch.
    setTrackingEpoch(23);

    resolveTrackedRead(sources[3]!, target);
    expectIncomingEdges(target, [
      movedEdge!,
      firstEdge!,
      secondEdge!,
      thirdEdge!,
    ]);
    expecttailIn(target, movedEdge!);
    expect(movedEdge!.version).toBe(23);
    expectOutgoingEdges(sources[3]!, [movedEdge!]);
    expectGraphIntegrity([...sources, target]);
  });

  it.each([
    { name: "no existing subscribers", withUnrelatedSubscriber: false },
    { name: "an unrelated subscriber", withUnrelatedSubscriber: true },
  ])(
    "appends at the tracking tail with $name",
    ({ withUnrelatedSubscriber }) => {
      forbidSlowPath();

      const retained = createProducerNode();
      const appended = createProducerNode();
      const target = createConsumerNode();
      const otherTarget = createConsumerNode();
      const retainedEdge = linkEdge(retained, target, null, 3);
      const unrelatedEdge = withUnrelatedSubscriber
        ? linkEdge(appended, otherTarget, null, 3)
        : null;

      target.tailIn = retainedEdge;
      retainedEdge.version = 29;

      resolveTrackedRead(appended, target);

      const appendedEdge = target.tailIn!;
      expect(appendedEdge).not.toBe(retainedEdge);
      expect(appendedEdge.from).toBe(appended);
      expect(appendedEdge.to).toBe(target);
      expect(appendedEdge.version).toBe(29);
      expectIncomingEdges(target, [retainedEdge, appendedEdge]);
      expecttailIn(target, appendedEdge);
      expectOutgoingEdges(
        appended,
        unrelatedEdge === null ? [appendedEdge] : [unrelatedEdge, appendedEdge],
      );
      expectGraphIntegrity([retained, appended, target, otherTarget]);
    },
  );

  it("dedupes a sole outgoing edge from the end-of-list cursor", () => {
    forbidSlowPath();

    const repeated = createProducerNode();
    const trailing = createProducerNode();
    const target = createConsumerNode();
    const repeatedEdge = linkEdge(repeated, target, null, 7);
    const trailingEdge = linkEdge(trailing, target, repeatedEdge, 7);
    const currentVersion = 37;
    setTrackingEpoch(currentVersion);

    resolveTrackedRead(repeated, target);
    resolveTrackedRead(trailing, target);
    expecttailIn(target, trailingEdge);
    expect(trailingEdge.nextIn).toBeNull();
    expectOutgoingEdges(repeated, [repeatedEdge]);

    resolveTrackedRead(repeated, target);
    expectIncomingEdges(target, [repeatedEdge, trailingEdge]);
    expecttailIn(target, trailingEdge);
    expect(repeatedEdge.version).toBe(currentVersion);
    expectOutgoingEdges(repeated, [repeatedEdge]);
    expectGraphIntegrity([repeated, trailing, target]);
  });

  it("dedupes a current-pass producer beyond the bounded prefix scan", () => {
    forbidSlowPath();

    const repeated = createProducerNode();
    const otherTarget = createConsumerNode();
    const unrelatedEdge = linkEdge(repeated, otherTarget, null, 5);
    const middleSources = Array.from({ length: 34 }, createProducerNode);
    const target = createConsumerNode();
    const repeatedEdge = linkEdge(repeated, target, null, 5);
    const middleEdges = middleSources.map((source) =>
      linkEdge(source, target, target.lastIn, 5),
    );
    const initialEdges = [repeatedEdge, ...middleEdges];
    const currentVersion = 41;
    setTrackingEpoch(currentVersion);

    resolveTrackedRead(repeated, target);
    for (const source of middleSources) resolveTrackedRead(source, target);

    const trackedTail = middleEdges.at(-1)!;
    expecttailIn(target, trackedTail);
    expect(repeatedEdge.version).toBe(currentVersion);

    resolveTrackedRead(repeated, target);
    expectIncomingEdges(target, initialEdges);
    expecttailIn(target, trackedTail);
    expect(repeatedEdge.version).toBe(currentVersion);
    expectOutgoingEdges(repeated, [unrelatedEdge, repeatedEdge]);
    expectGraphIntegrity([repeated, otherTarget, target, ...middleSources]);
  });
  it("retains a distant duplicate edge across a dirty nested computation", () => {
    const a = createProducer(1);
    const middleSources = Array.from({ length: 34 }, () => createProducer(1));
    const nestedSource = createProducer(10);
    const nested = createConsumer(() => readProducer(nestedSource));
    const unrelated = createConsumer(() => readProducer(a));

    // Multiple outgoing edges prevent the sole-subscriber shortcut from
    // concealing a failed distant-prefix membership check.
    expect(readConsumer(unrelated)).toBe(1);
    expect(readConsumer(nested)).toBe(10);

    const outer = createConsumer(() => {
      let value = readProducer(a);
      for (const source of middleSources) value += readProducer(source);
      value += readConsumer(nested);
      return value + readProducer(a);
    });
    const nodes = [a, ...middleSources, nestedSource, nested, unrelated, outer];

    expect(readConsumer(outer)).toBe(46);
    const retainedEdge = incomingEdges(outer).find((edge) => edge.from === a);
    expect(retainedEdge).toBeDefined();

    const verifyTopology = () => {
      const incoming = incomingEdges(outer);
      const incomingMatches = incoming.filter((edge) => edge.from === a);
      const outgoingMatches = outgoingEdges(a).filter(
        (edge) => edge.to === outer,
      );
      expect(incomingMatches).toHaveLength(1);
      expect(outgoingMatches).toHaveLength(1);
      expect(incomingMatches[0]).toBe(retainedEdge);
      expect(outgoingMatches[0]).toBe(retainedEdge);
      expect(outer.tailIn).toBe(outer.lastIn);
      expectGraphIntegrity(nodes);
      for (const node of nodes) {
        for (const edge of incomingEdges(node)) {
          expect(outgoingEdges(edge.from)).toContain(edge);
        }
        for (const edge of outgoingEdges(node)) {
          expect(incomingEdges(edge.to)).toContain(edge);
        }
      }
    };
    verifyTopology();

    writeProducer(nestedSource, 20);
    // Direct invalidation forces outer computation before pull can refresh
    // nested, so nested advances its tracking epoch inside the outer pass.
    writeProducer(a, 2);
    expect(readConsumer(outer)).toBe(58);
    verifyTopology();

    // Re-execute the same dependency trace with nested already clean.
    writeProducer(a, 3);
    expect(readConsumer(outer)).toBe(60);
    verifyTopology();
    expect(readConsumer(outer)).toBe(60);
    verifyTopology();
  });
});
