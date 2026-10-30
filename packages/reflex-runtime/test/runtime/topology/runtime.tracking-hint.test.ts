import { beforeEach, describe, expect, it } from "vitest";

import {
  Computing,
  Consumer,
  Producer,
  ReactiveNode,
  Watcher,
  advanceTrackingStamp,
  cleanupUnvisitedSources,
  disposeNode,
  findEdgeInLockstep,
  isOutgoingHint,
  linkEdge,
  resolveTrackedRead,
  unlinkAllSources,
  unlinkAllSubscribers,
  unlinkEdge,
  type ReactiveEdge,
} from "../../../src/kernel";
import {
  createConsumer,
  createProducer,
} from "../../../src/protocol/create.node";
import { readConsumer } from "../../../src/protocol/read.consumer";
import { readProducer } from "../../../src/protocol/read.producer";
import { writeProducer } from "../../../src/protocol/write.producer";
import { expectGraphIntegrity, resetRuntime } from "../../runtime.test_utils";
import {
  expectTailInvariant,
  incomingEdges,
  outgoingEdges,
} from "../../tools/graph/graph-inspector";

const node = (kind = Producer) => new ReactiveNode(undefined, undefined, kind);

/** Subscribers ahead of the consumer: past the lookup's 4-link head start. */
const WIDE = 6;

function wideProducer(): ReactiveNode {
  const producer = node();
  subscribe(producer, WIDE);
  return producer;
}

function subscribe(producer: ReactiveNode, count: number): void {
  for (let i = 0; i < count; i++) linkEdge(producer, node(Consumer));
}

/** One tracking pass of `consumer` over `reads`, as a computation runs it. */
function pass(
  consumer: ReactiveNode,
  reads: readonly ReactiveNode[],
  { cleanup = true } = {},
): void {
  advanceTrackingStamp();
  consumer.tailIn = null;
  for (const producer of reads) resolveTrackedRead(producer, consumer);
  if (cleanup && consumer.tailIn !== consumer.lastIn)
    cleanupUnvisitedSources(consumer);
}

const edgeOf = (producer: ReactiveNode, consumer: ReactiveNode) =>
  outgoingEdges(producer).find((edge) => edge.to === consumer) ?? null;

/**
 * A wide consumer that re-read a wide producer, which left a hint. The pair's
 * edge sits in the middle of the producer's list: with it at the tail, the
 * newest-outgoing probe settles the duplicates before any lookup.
 */
function hinted() {
  const hub = wideProducer();
  const items = Array.from({ length: 8 }, () => node());
  const consumer = node(Consumer);
  const reads = items.flatMap((item) => [item, hub]);
  pass(consumer, reads);
  subscribe(hub, 3);
  expect(hub.tailIn).toBeNull();
  pass(consumer, reads);
  const edge = edgeOf(hub, consumer)!;
  return { hub, items, consumer, reads, edge };
}

beforeEach(() => {
  resetRuntime();
});

describe("Reactive runtime - outgoing hint (INV-H)", () => {
  it("is left by a duplicate read past the head start and stays exact", () => {
    const { hub, items, consumer, reads, edge } = hinted();

    expect(hub.tailIn).toBe(edge);
    expect(isOutgoingHint(hub, edge)).toBe(true);
    expect(incomingEdges(consumer).map((e) => e.from)).toEqual([
      items[0],
      hub,
      ...items.slice(1),
    ]);

    // A later pass resolves every duplicate through the hint; the graph is
    // the one the lockstep alone produces.
    pass(consumer, reads);
    expect(hub.tailIn).toBe(edge);
    expect(incomingEdges(consumer).map((e) => e.from)).toEqual([
      items[0],
      hub,
      ...items.slice(1),
    ]);
    expectGraphIntegrity([hub, consumer, ...items]);
  });

  it("is a positive answer only: a hint of another pair proves nothing", () => {
    const { hub, edge } = hinted();
    const stranger = node(Consumer);

    expect(findEdgeInLockstep(hub, stranger, null, null)).toBeNull();
    expect(hub.tailIn).toBe(edge);
  });

  it("never reads a self-edge as a hint", () => {
    const self = wideProducer();
    const loop = linkEdge(self, self);

    // A computing consumer reading itself: the slot is its frontier.
    self.state |= Computing;
    self.tailIn = loop;
    expect(findEdgeInLockstep(self, self, null, self.firstIn)).toBe(loop);
    expect(self.tailIn).toBe(loop);
    self.state &= ~Computing;

    // Whatever reading the slot is in, a self-edge reads as incoming and is
    // never returned for another consumer.
    expect(isOutgoingHint(self, loop)).toBe(false);
    expectTailInvariant(self);
    const other = node(Consumer);
    linkEdge(self, other);
    expect(findEdgeInLockstep(self, other, null, other.firstIn)?.to).toBe(
      other,
    );
    expectTailInvariant(self);
  });

  it.each([
    ["Computing", Computing],
    ["Watcher", Watcher],
  ])("is never written into a %s node", (_, flag) => {
    const producer = wideProducer();
    const consumer = node(Consumer);
    const edge = linkEdge(producer, consumer);
    const frontier = linkEdge(node(), producer);
    producer.state |= flag;
    producer.tailIn = frontier;

    expect(findEdgeInLockstep(producer, consumer, null, edge)).toBe(edge);
    expect(producer.tailIn).toBe(frontier);
  });

  describe("never outlives its edge", () => {
    const cases: Array<[string, (h: ReturnType<typeof hinted>) => void]> = [
      ["unlinkEdge", ({ edge }) => unlinkEdge(edge)],
      [
        "cleanup of a pass that dropped the dependency",
        ({ consumer, items }) => pass(consumer, items),
      ],
      [
        "cleanup of a long suffix behind a new dependency",
        ({ consumer, hub }) => {
          const long = Array.from({ length: 40 }, () => node());
          pass(consumer, [hub, ...long]);
          expect(hub.tailIn).toBe(edgeOf(hub, consumer));
          // A new dependency with subscribers, read first, keeps the 41-edge
          // suffix attached for the rest of the pass; cleanup removes it.
          pass(consumer, [wideProducer()], { cleanup: false });
          expect(edgeOf(hub, consumer)).not.toBeNull();
          cleanupUnvisitedSources(consumer);
          expect(edgeOf(hub, consumer)).toBeNull();
        },
      ],
      [
        "unlinkAllSources of the consumer",
        ({ consumer }) => unlinkAllSources(consumer),
      ],
      [
        "unlinkAllSubscribers of the producer",
        ({ hub }) => unlinkAllSubscribers(hub),
      ],
      ["disposal of the consumer", ({ consumer }) => disposeNode(consumer)],
      ["disposal of the producer", ({ hub }) => disposeNode(hub)],
    ];

    it.each(cases)("%s", (_, unlink) => {
      const graph = hinted();
      unlink(graph);

      expect(graph.hub.tailIn).not.toBe(graph.edge);
      expectTailInvariant(graph.hub);
      expectGraphIntegrity([graph.hub, graph.consumer, ...graph.items]);

      // The pair is found again by the lockstep, never through a stale slot.
      pass(graph.consumer, graph.reads);
      const edge = edgeOf(graph.hub, graph.consumer);
      expect(edge).not.toBe(graph.edge);
      expect(incomingEdges(graph.consumer)).toContain(edge);
      expectGraphIntegrity([graph.hub, graph.consumer, ...graph.items]);
    });
  });

  it("is cleared before a recomputed producer's slot becomes its frontier", () => {
    const source = createProducer(0);
    const seen: Array<ReactiveEdge | null> = [];
    const hub = createConsumer(() => {
      seen.push(hub.tailIn);
      const value = readProducer(source);
      seen.push(hub.tailIn);
      return value;
    });
    const subscriber = () => {
      const s = createConsumer(() => readConsumer(hub));
      readConsumer(s);
      return s;
    };
    // The wide consumer sits in the middle of the computed hub's list.
    const subscribers = Array.from({ length: WIDE }, subscriber);
    const items = Array.from({ length: 6 }, (_, i) => createProducer(i));
    const wide = createConsumer(() => {
      let sum = 0;
      for (const item of items) sum += readProducer(item) + readConsumer(hub);
      return sum;
    });
    readConsumer(wide);
    subscribers.push(subscriber(), subscriber());
    writeProducer(items[0]!, 10);
    readConsumer(wide);
    const edge = edgeOf(hub, wide)!;
    expect(hub.tailIn).toBe(edge);

    // items[0] changes first, so the wide consumer recomputes and its read of
    // the hub recomputes the hub inside the wide consumer's pass.
    seen.length = 0;
    writeProducer(source, 1);
    writeProducer(items[0]!, 20);
    readConsumer(wide);

    // On entry the slot is null, not the hint; after the read it is the
    // frontier, an incoming edge of the hub.
    expect(seen[0]).toBeNull();
    expect(seen[1]?.to).toBe(hub);
    // The wide consumer's next duplicate lookup refilled the hint.
    expect(hub.tailIn).toBe(edge);
    expect(edgeOf(hub, wide)).toBe(edge);
    expectGraphIntegrity([hub, wide, ...subscribers, ...items]);
  });
});

describe("Reactive runtime - outgoing finger coverage", () => {
  it("finds every pair or proves absence from every finger, including ring wraps", () => {
    for (let degree = 3; degree <= 40; degree++) {
      const producer = node();
      const consumers = Array.from({ length: degree + 1 }, () =>
        node(Consumer),
      );
      const pairs: (ReactiveEdge | null)[] = [];
      for (let i = 0; i < consumers.length; i++) {
        const consumer = consumers[i]!;
        // Keep either incoming walk beyond the entire finger window, so
        // the outgoing probes and the continuation must cover every pair.
        for (let j = 0; j < 24; j++) linkEdge(node(), consumer);
        pairs.push(i < degree ? linkEdge(producer, consumer) : null);
        for (let j = 0; j < 24; j++) linkEdge(node(), consumer);
      }

      for (let finger = 0; finger < degree; finger++) {
        for (let target = 0; target < consumers.length; target++) {
          const consumer = consumers[target]!;
          for (const backward of [false, true]) {
            producer.tailIn = pairs[finger]!;
            const found = findEdgeInLockstep(
              producer,
              consumer,
              backward ? consumer.lastIn : null,
              backward ? null : consumer.firstIn,
            );
            expect(
              found === pairs[target],
              `degree=${degree}, finger=${finger}, target=${target}, backward=${backward}`,
            ).toBe(true);
          }
        }
      }
      expectGraphIntegrity([producer, ...consumers]);
    }
  });
});

describe("Reactive runtime - outgoing hint against the lockstep alone", () => {
  /**
   * Two identical worlds take the same random operations: passes with hub
   * duplicates, passes without cleanup (as after a throw), unlinks and
   * disposals. The reference scrubs every hint before each read, so each
   * lookup is decided by the lockstep alone. Graphs must stay identical,
   * edge for edge and stamp for stamp, and INV-H must hold throughout.
   */
  function world(seed: number) {
    let state = seed >>> 0 || 1;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0x100000000;
    };
    const int = (n: number) => Math.floor(random() * n);
    const nodes: ReactiveNode[] = [];
    const make = (kind: number) => {
      const n = node(kind);
      nodes.push(n);
      return n;
    };
    const producers = Array.from({ length: 40 }, () => make(Producer));
    const consumers = Array.from({ length: 10 }, () => make(Consumer));
    const hubs = producers.slice(0, 3);
    return { nodes, producers, consumers, hubs, random, int };
  }

  function step(
    w: ReturnType<typeof world>,
    scrub: boolean,
    resolve: (p: ReactiveNode, c: ReactiveNode) => void,
  ) {
    const { int, random, producers, consumers, hubs, nodes } = w;
    const r = random();
    if (r < 0.8) {
      const consumer = consumers[int(consumers.length)]!;
      advanceTrackingStamp();
      consumer.tailIn = null;
      const count = int(50);
      for (let i = 0; i < count; i++) {
        const producer =
          random() < 0.4
            ? hubs[int(hubs.length)]!
            : producers[int(producers.length)]!;
        if (scrub)
          for (const n of nodes)
            if (n.tailIn !== null && isOutgoingHint(n, n.tailIn))
              n.tailIn = null;
        resolve(producer, consumer);
      }
      if (random() < 0.9 && consumer.tailIn !== consumer.lastIn)
        cleanupUnvisitedSources(consumer);
    } else if (r < 0.9) {
      const consumer = consumers[int(consumers.length)]!;
      const edges = incomingEdges(consumer);
      if (edges.length > 0) unlinkEdge(edges[int(edges.length)]!);
    } else {
      disposeNode(nodes[int(nodes.length)]!);
    }
  }

  // The worlds share the tracking clock and advance it in turn, so stamps are
  // compared by rank within each world, which preserves INV-T3's classes.
  function signature(w: ReturnType<typeof world>): string {
    const id = new Map(w.nodes.map((n, i) => [n, i]));
    const stamps = [
      ...new Set(w.nodes.flatMap((n) => incomingEdges(n).map((e) => e.stamp))),
    ].sort((a, b) => a - b);
    const rank = new Map(stamps.map((stamp, i) => [stamp, i]));
    return w.nodes
      .map((n) => {
        const ins = incomingEdges(n).map(
          (e) => `${id.get(e.from)}@${rank.get(e.stamp)}`,
        );
        const outs = outgoingEdges(n).map((e) => id.get(e.to));
        return `${ins}|${outs}`;
      })
      .join(";");
  }

  it("produces the same graphs and keeps INV-H", () => {
    let hintsSeen = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const hinted = world(seed);
      const reference = world(seed);
      for (let i = 0; i < 100; i++) {
        step(hinted, false, resolveTrackedRead);
        step(reference, true, resolveTrackedRead);
        for (const n of hinted.nodes) {
          expectTailInvariant(n);
          if (n.tailIn !== null && isOutgoingHint(n, n.tailIn)) hintsSeen++;
        }
      }
      expect(signature(hinted), `seed ${seed}`).toBe(signature(reference));
    }
    expect(hintsSeen).toBeGreaterThan(0);
  }, 60_000);
});
