import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  Consumer,
  Producer,
  ReactiveNode,
  findEdgeInLockstep,
  linkEdge,
  moveLastIncomingEdgeAfterEdgeUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
  moveNonHeadIncomingEdgeToFrontUnchecked,
} from "../../../src/kernel";
import { isEdgeInTrackedPrefix } from "../../../src/kernel/shape/tracking/prefix";
import {
  expectGraphIntegrity,
  expectIncomingEdges,
  expectOutgoingEdges,
} from "../../runtime.test_utils";
import { incomingEdges } from "../../tools/graph/graph-inspector";

const node = (kind = Producer) => new ReactiveNode(undefined, undefined, kind);

/**
 * A consumer in the middle of a pass: `prefixLength` accepted edges ending at
 * the cursor, then `suffixLength` edges from earlier passes. Positions listed
 * in `matches` (over the whole list) read `producer`; at most one edge per
 * pair, so only the first listed position is used. The producer also has
 * unrelated subscribers before and after the matching edge.
 */
function buildPass(options: {
  prefixLength: number;
  suffixLength: number;
  match: number | null;
  before: number;
  after: number;
  stamp: number;
  staleStamps: readonly number[];
}) {
  const { prefixLength, suffixLength, match, before, after, stamp } = options;
  const producer = node();
  const consumer = node(Consumer);
  for (let i = 0; i < before; i++) linkEdge(producer, node(Consumer));
  const length = prefixLength + suffixLength;
  for (let i = 0; i < length; i++) {
    const edge = linkEdge(i === match ? producer : node(), consumer);
    // INV-T3: the prefix carries the pass stamp, the suffix older stamps.
    edge.version =
      i < prefixLength
        ? stamp
        : stamp === 0
          ? 0
          : options.staleStamps[i % options.staleStamps.length]! % stamp;
  }
  for (let i = 0; i < after; i++) linkEdge(producer, node(Consumer));
  const edges = incomingEdges(consumer);
  const cursor = prefixLength === 0 ? null : edges[prefixLength - 1]!;
  consumer.tailIn = cursor;
  return { producer, consumer, edges, cursor };
}

const passShape = fc.record({
  prefixLength: fc.integer({ min: 1, max: 80 }),
  suffixLength: fc.constantFrom(0, 1, 2, 31, 32, 33, 64),
  match: fc.option(fc.nat({ max: 150 }), { nil: null }),
  before: fc.integer({ min: 0, max: 40 }),
  after: fc.integer({ min: 0, max: 40 }),
  stamp: fc.constantFrom(0, 1, 17, 0x7fffffff, 2 ** 40),
  staleStamps: fc.array(fc.nat(), { minLength: 1, maxLength: 4 }),
});

describe("Reactive runtime - exact pair lookup and prefix classification", () => {
  it("finds the pair edge or proves its absence from any covering start", () => {
    fc.assert(
      fc.property(passShape, (shape) => {
        const { producer, consumer, edges, cursor } = buildPass(shape);
        const expected = edges.find((edge) => edge.from === producer) ?? null;
        const index = edges.indexOf(cursor!);
        const comparedCursor = cursor!.from === producer ? cursor : null;

        // Outward from the cursor, as the resolver searches: the cursor itself
        // is compared by the caller.
        const outward = findEdgeInLockstep(
          producer,
          consumer,
          cursor!.prevIn,
          cursor!.nextIn,
        );
        expect(comparedCursor ?? outward).toBe(expected);

        // Forward over the whole list, as the default strategy searches.
        expect(
          findEdgeInLockstep(producer, consumer, null, consumer.firstIn),
        ).toBe(expected);
        // Backward from the tail, as the end-of-list guard searches.
        expect(
          findEdgeInLockstep(producer, consumer, consumer.lastIn, null),
        ).toBe(expected);
        expect(index).toBe(shape.prefixLength - 1);
      }),
      { numRuns: 1000, seed: 20261024 },
    );
  });

  it("classifies an edge into the tracked prefix by stamp or position", () => {
    fc.assert(
      fc.property(passShape, (shape) => {
        const { consumer, edges, cursor } = buildPass(shape);
        edges.forEach((edge, index) => {
          expect(isEdgeInTrackedPrefix(consumer, cursor!, edge)).toBe(
            index < shape.prefixLength,
          );
        });
      }),
      { numRuns: 1000, seed: 20261025 },
    );
  });

  it("treats every edge as prefix when the cursor is at lastIn (INV-T2)", () => {
    const consumer = node(Consumer);
    const edges = Array.from({ length: 5 }, (_, i) =>
      linkEdge(node(), consumer, consumer.lastIn, i + 1),
    );
    // Watcher validation spans committed edges with unrelated stamps.
    consumer.tailIn = consumer.lastIn;
    for (const edge of edges)
      expect(isEdgeInTrackedPrefix(consumer, consumer.tailIn, edge)).toBe(true);
  });

  it("proves absence from whichever list ends first", () => {
    const wide = node(Consumer);
    for (let i = 0; i < 1000; i++) linkEdge(node(), wide);
    const narrowProducer = node();
    linkEdge(narrowProducer, node(Consumer));
    expect(
      findEdgeInLockstep(narrowProducer, wide, wide.lastIn, null),
    ).toBeNull();

    const shared = node();
    for (let i = 0; i < 1000; i++) linkEdge(shared, node(Consumer));
    const narrow = node(Consumer);
    linkEdge(node(), narrow);
    expect(findEdgeInLockstep(shared, narrow, narrow.lastIn, null)).toBeNull();
    const narrowEdge = linkEdge(shared, narrow);
    expect(findEdgeInLockstep(shared, narrow, narrow.lastIn, null)).toBe(
      narrowEdge,
    );
  });
});

describe("Reactive runtime - specialized incoming moves", () => {
  it("preserves identities and outgoing order for every legal front/tail move", () => {
    for (let length = 2; length <= 12; length++) {
      for (let index = 1; index < length; index++) {
        for (const specializedTail of [false, true]) {
          if (specializedTail && index !== length - 1) continue;
          const consumer = node(Consumer);
          const sources = Array.from({ length }, () => node());
          const edges = sources.map((source) => linkEdge(source, consumer));
          consumer.tailIn = edges[index - 1]!;
          const cursor = consumer.tailIn;
          const moved = edges[index]!;
          if (specializedTail)
            moveLastIncomingEdgeToFrontUnchecked(consumer, moved);
          else moveNonHeadIncomingEdgeToFrontUnchecked(consumer, moved);
          expectIncomingEdges(consumer, [
            moved,
            ...edges.filter((edge) => edge !== moved),
          ]);
          expect(consumer.tailIn).toBe(cursor);
          for (let i = 0; i < length; i++)
            expectOutgoingEdges(sources[i]!, [edges[i]!]);
          expectGraphIntegrity([...sources, consumer]);
        }
      }
      for (let index = 0; index < length - 1; index++) {
        const consumer = node(Consumer);
        const sources = Array.from({ length }, () => node());
        const edges = sources.map((source) => linkEdge(source, consumer));
        const last = edges.at(-1)!;
        consumer.tailIn = last;
        moveLastIncomingEdgeAfterEdgeUnchecked(consumer, last, edges[index]!);
        const expected = edges.slice(0, -1);
        expected.splice(index + 1, 0, last);
        expectIncomingEdges(consumer, expected);
        expect(consumer.tailIn).toBe(last);
        for (let i = 0; i < length; i++)
          expectOutgoingEdges(sources[i]!, [edges[i]!]);
        expectGraphIntegrity([...sources, consumer]);
      }
    }
  });
});
