import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  Consumer,
  Producer,
  ReactiveNode,
  linkEdge,
  moveLastIncomingEdgeAfterEdgeUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
  moveNonHeadIncomingEdgeToFrontUnchecked,
} from "../../../src/kernel";
import {
  hasProducerInCompletedPrefix,
  hasProducerInTrackedPrefix,
  scanProducerInTrackedPrefix,
  PrefixHit,
  PrefixMiss,
  PrefixScanLimitReached,
} from "../../../src/kernel/shape/tracking/prefix";
import {
  expectGraphIntegrity,
  expectIncomingEdges,
  expectOutgoingEdges,
} from "../../runtime.test_utils";

const node = (kind = Producer) => new ReactiveNode(undefined, undefined, kind);

describe("Reactive runtime - optimized prefix membership", () => {
  it("matches bounded traversal with arbitrary versions and subscriber positions", () => {
    fc.assert(
      fc.property(
        fc.record({
          length: fc.integer({ min: 0, max: 96 }),
          suffixLength: fc.constantFrom(0, 1, 2, 33, 64),
          matches: fc.array(fc.nat({ max: 95 }), { maxLength: 4 }),
          before: fc.integer({ min: 0, max: 8 }),
          after: fc.integer({ min: 0, max: 8 }),
          version: fc.constantFrom(0, 1, 17, -1, 0x80000000),
          edgeVersion: fc.constantFrom(0, 1, 17, -1, 0x80000000),
        }),
        ({
          length,
          suffixLength,
          matches,
          before,
          after,
          version,
          edgeVersion,
        }) => {
          const producer = node();
          const consumer = node(Consumer);
          for (let i = 0; i < before; i++) linkEdge(producer, node(Consumer));
          for (let i = 0; i < length; i++) {
            const edge = linkEdge(
              matches.includes(i) ? producer : node(),
              consumer,
            );
            edge.version = edgeVersion;
          }
          // The completed-prefix helper is entered only after a cursor miss.
          const cursor = linkEdge(node(), consumer);
          consumer.tailIn = cursor;
          for (let i = 0; i < suffixLength; i++) {
            const edge = linkEdge(
              matches.includes(i) ? producer : node(),
              consumer,
            );
            edge.version = edgeVersion;
          }
          for (let i = 0; i < after; i++) linkEdge(producer, node(Consumer));

          let edge = cursor.prevIn;
          let visited = 0;
          let hit = false;
          while (edge !== null && visited < 32) {
            if (edge.from === producer) {
              hit = true;
              break;
            }
            edge = edge.prevIn;
            visited++;
          }
          const result = hit
            ? PrefixHit
            : edge === null
              ? PrefixMiss
              : PrefixScanLimitReached;
          let expected = hit;
          if (!hit && result === PrefixScanLimitReached && version !== 0) {
            for (let out = producer.firstOut; out !== null; out = out.nextOut) {
              if (out.to === consumer && out.version === version)
                expected = true;
            }
          }
          expect(scanProducerInTrackedPrefix(producer, cursor)).toBe(result);
          expect(
            hasProducerInTrackedPrefix(producer, consumer, cursor, version),
          ).toBe(expected);
          if (suffixLength === 0) {
            expect(
              hasProducerInCompletedPrefix(producer, consumer, cursor, version),
            ).toBe(expected);
          }
        },
      ),
      { numRuns: 1000, seed: 20260910 },
    );
  });

  it.each([31, 32, 33, 34, 65])(
    "preserves the zero-version boundary at distance %i",
    (distance) => {
      const producer = node();
      const consumer = node(Consumer);
      linkEdge(producer, consumer, null, 0);
      for (let i = 1; i < distance; i++) linkEdge(node(), consumer);
      const cursor = linkEdge(node(), consumer);
      consumer.tailIn = cursor;
      expect(hasProducerInCompletedPrefix(producer, consumer, cursor, 0)).toBe(
        distance <= 32,
      );
      expect(scanProducerInTrackedPrefix(producer, cursor)).toBe(
        distance <= 32 ? PrefixHit : PrefixScanLimitReached,
      );
    },
  );
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
