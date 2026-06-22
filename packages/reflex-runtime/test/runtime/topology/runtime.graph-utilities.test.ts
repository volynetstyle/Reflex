import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  Consumer,
  Producer,
  ReactiveNode,
  linkEdge,
  moveIncomingEdgeAfterUnchecked,
  unlinkAllSources,
  unlinkAllSubscribers,
  unlinkDetachedIncomingEdgeSequence,
  unlinkEdge,
} from "../../../src/kernel";
import type { ReactiveEdge } from "../../../src/kernel";
import {
  expectGraphIntegrity,
  expectIncomingEdges,
  expectOutgoingEdges,
  expecttailIn,
} from "../../runtime.test_utils";

function createNode(kind = Producer) {
  return new ReactiveNode(undefined, undefined, kind);
}

function expectDetached(edge: ReactiveEdge): void {
  expect(edge.prevIn).toBeNull();
  expect(edge.nextIn).toBeNull();
  expect(edge.prevOut).toBeNull();
  expect(edge.nextOut).toBeNull();
}

describe("Reactive runtime - graph utility model", () => {
  it("preserves both intrusive lists across generated link/unlink histories", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            producer: fc.integer({ min: 0, max: 5 }),
            consumer: fc.integer({ min: 0, max: 3 }),
            remove: fc.boolean(),
          }),
          { minLength: 1, maxLength: 100 },
        ),
        (operations) => {
          const producers = Array.from({ length: 6 }, () =>
            createNode(Producer),
          );
          const consumers = Array.from({ length: 4 }, () =>
            createNode(Consumer),
          );
          const edges: ReactiveEdge[] = [];

          for (const operation of operations) {
            if (operation.remove && edges.length !== 0) {
              const index =
                (operation.producer * consumers.length + operation.consumer) %
                edges.length;
              const [edge] = edges.splice(index, 1);

              unlinkEdge(edge!);
              expectDetached(edge!);
            } else {
              edges.push(
                linkEdge(
                  producers[operation.producer]!,
                  consumers[operation.consumer]!,
                ),
              );
            }

            expectGraphIntegrity([...producers, ...consumers]);
            for (const producer of producers) {
              expectOutgoingEdges(
                producer,
                edges.filter((edge) => edge.from === producer),
              );
            }
            for (const consumer of consumers) {
              expectIncomingEdges(
                consumer,
                edges.filter((edge) => edge.to === consumer),
              );
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("moves any incoming edge to any legal position", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.nat(),
        fc.nat(),
        (length, rawEdgeIndex, rawAfterIndex) => {
          const target = createNode(Consumer);
          const producers = Array.from({ length }, () => createNode(Producer));
          const edges = producers.map((producer) => linkEdge(producer, target));
          const edgeIndex = rawEdgeIndex % length;
          const positions = [
            null,
            ...edges.filter((_edge, index) => index !== edgeIndex),
          ];
          const after = positions[rawAfterIndex % positions.length]!;
          const edge = edges[edgeIndex]!;
          const expected = edges.filter((candidate) => candidate !== edge);
          const insertIndex = after === null ? 0 : expected.indexOf(after) + 1;

          expected.splice(insertIndex, 0, edge);
          moveIncomingEdgeAfterUnchecked(target, edge, after);

          expectIncomingEdges(target, expected);
          expectGraphIntegrity([...producers, target]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("unlinks all sources and clears the consumer cursor", () => {
    const target = createNode(Consumer);
    const producers = Array.from({ length: 5 }, () => createNode(Producer));
    const edges = producers.map((producer) => linkEdge(producer, target));
    target.tailIn = edges[2]!;

    unlinkAllSources(target);

    expectIncomingEdges(target, []);
    expecttailIn(target, null);
    for (const producer of producers) expectOutgoingEdges(producer, []);
    for (const edge of edges) expectDetached(edge);
    expectGraphIntegrity([...producers, target]);
  });

  it("unlinks all subscribers and rewinds matching consumer cursors", () => {
    const source = createNode(Producer);
    const consumers = Array.from({ length: 5 }, () => createNode(Consumer));
    const edges = consumers.map((consumer) => linkEdge(source, consumer));

    for (let index = 0; index < consumers.length; index += 1) {
      consumers[index]!.tailIn = edges[index]!;
    }

    unlinkAllSubscribers(source);

    expectOutgoingEdges(source, []);
    for (const consumer of consumers) {
      expectIncomingEdges(consumer, []);
      expecttailIn(consumer, null);
    }
    for (const edge of edges) expectDetached(edge);
    expectGraphIntegrity([source, ...consumers]);
  });

  it("unlinks a detached incoming suffix from every producer", () => {
    const target = createNode(Consumer);
    const retained = createNode(Producer);
    const stale = Array.from({ length: 4 }, () => createNode(Producer));
    const retainedEdge = linkEdge(retained, target);
    const staleEdges = stale.map((producer) => linkEdge(producer, target));

    retainedEdge.nextIn = null;
    target.lastIn = retainedEdge;
    staleEdges[0]!.prevIn = null;

    unlinkDetachedIncomingEdgeSequence(staleEdges[0]!);

    expectIncomingEdges(target, [retainedEdge]);
    expectOutgoingEdges(retained, [retainedEdge]);
    for (const producer of stale) expectOutgoingEdges(producer, []);
    for (const edge of staleEdges) expectDetached(edge);
    expectGraphIntegrity([target, retained, ...stale]);
  });
});
