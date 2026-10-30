import { describe, expect, it } from "vitest";

import {
  Computing,
  Consumer,
  Leased,
  Producer,
  ReactiveNode,
  advance,
  cleanupUnvisitedSources,
  enterConsumerTracking,
  linkEdge,
  resolveTrackedRead,
  restoreConsumerTracking,
  unlinkAllSources,
  type ReactiveEdge,
} from "../../../src/kernel";
import {
  createConsumer,
  createProducer,
} from "../../../src/protocol/create.node";
import { readConsumer } from "../../../src/protocol/read.consumer";
import { readProducer } from "../../../src/protocol/read.producer";
import { writeProducer } from "../../../src/protocol/write.producer";
import {
  expectGraphIntegrity,
  incomingEdges,
  outgoingEdges,
} from "../../tools/graph/graph-inspector";

// INV-P (docs/INVARIANTS.md), graph/tape.ts. Assertions compare indices and
// booleans only: a failing matcher on a node would print the whole graph.

const node = (kind = Producer) => new ReactiveNode(undefined, undefined, kind);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** A computation's tracking frame over `consumer`, as the engine opens it. */
function begin(consumer: ReactiveNode): ReactiveNode | null {
  consumer.tailIn = null;
  consumer.state |= Computing;
  return enterConsumerTracking(consumer);
}

function end(consumer: ReactiveNode, previous: ReactiveNode | null): void {
  restoreConsumerTracking(previous);
  consumer.state &= ~Computing;
  if (consumer.tailIn !== consumer.lastIn) cleanupUnvisitedSources(consumer);
}

function shuffled(values: readonly number[], seed: number): number[] {
  const order = [...values];
  let state = seed >>> 0 || 1;
  for (let i = order.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

const edgeOf = (producer: ReactiveNode, consumer: ReactiveNode) =>
  outgoingEdges(producer).find((edge) => edge.to === consumer) ?? null;
const pairs = (consumer: ReactiveNode, producer: ReactiveNode) =>
  incomingEdges(consumer).filter((edge) => edge.from === producer).length;
const sourcesOf = (consumer: ReactiveNode, pool: readonly ReactiveNode[]) =>
  incomingEdges(consumer).map((edge) => pool.indexOf(edge.from));
const isCell = (producer: ReactiveNode, consumer: ReactiveNode) =>
  producer.tailIn !== null && producer.tailIn === edgeOf(producer, consumer);
const leased = (producer: ReactiveNode) => (producer.state & Leased) !== 0;

function expectUniquePairs(consumer: ReactiveNode): void {
  const froms = incomingEdges(consumer).map((edge) => edge.from);
  expect(new Set(froms).size === froms.length, "duplicate pair").toBe(true);
}

/**
 * 256 sources whose outgoing lists hold 96 other subscribers, then the
 * consumer, then one more: every pair lookup of the consumer leaves the
 * locality tiers (no finger, head start and incoming walks far off).
 */
function wideGraph() {
  const sources = range(256).map(() => node());
  const consumer = node(Consumer);
  const others = (count: number) => {
    for (let i = 0; i < count; i++) {
      const other = node(Consumer);
      for (const source of sources) linkEdge(source, other);
    }
  };
  others(96);
  for (const source of sources) linkEdge(source, consumer);
  others(1);
  return { sources, consumer };
}

/** Two far reads: two strikes of the pass, so the tape is prepared. */
function prepare(sources: ReactiveNode[], consumer: ReactiveNode): void {
  resolveTrackedRead(sources[128]!, consumer);
  resolveTrackedRead(sources[200]!, consumer);
}

/** A producer with `count` subscribers that counts reads of `edge.to`. */
function countedNovel(count: number) {
  const novel = node();
  for (let i = 0; i < count; i++) linkEdge(novel, node(Consumer));
  let reads = 0;
  for (const edge of outgoingEdges(novel)) {
    const to = edge.to;
    Object.defineProperty(edge, "to", {
      get: () => (reads++, to),
      configurable: true,
    });
  }
  return { novel, reads: () => reads };
}

describe("prepared tape (INV-P)", () => {
  it("prepares on the second strike of a pass: a cell and a bit per producer", () => {
    const { sources, consumer } = wideGraph();
    const before = new Map(incomingEdges(consumer).map((e) => [e.from, e]));
    const previous = begin(consumer);
    resolveTrackedRead(sources[128]!, consumer);
    // One strike: only the found pair's own hint (INV-H), no tape.
    expect(sources.filter((s) => isCell(s, consumer)).length).toBe(1);
    resolveTrackedRead(sources[200]!, consumer);
    expect(sources.every((s) => isCell(s, consumer) && leased(s))).toBe(true);

    for (const j of shuffled(range(256), 7))
      resolveTrackedRead(sources[j]!, consumer);
    end(consumer, previous);

    expect(incomingEdges(consumer).length).toBe(256);
    expect(
      incomingEdges(consumer).every((e) => before.get(e.from) === e),
      "every edge kept its identity",
    ).toBe(true);
    // Cells outlive the pass as hints (INV-H).
    expect(sources.every((s) => isCell(s, consumer))).toBe(true);
    expectGraphIntegrity([...sources, consumer]);
  });

  it("does not prepare for a single far lookup per pass", () => {
    const { sources, consumer } = wideGraph();
    for (let pass = 0; pass < 3; pass++) {
      const previous = begin(consumer);
      const far = 64 + pass * 32;
      resolveTrackedRead(sources[far]!, consumer);
      for (let j = 0; j < 256; j++)
        if (j !== far) resolveTrackedRead(sources[j]!, consumer);
      expect(
        sources.filter((s) => isCell(s, consumer)).length < 8,
        "no tape",
      ).toBe(true);
      end(consumer, previous);
    }
    expectUniquePairs(consumer);
  });

  it("certifies a covered miss as absent without searching, then finds the link", () => {
    const { sources, consumer } = wideGraph();
    const { novel, reads } = countedNovel(97);
    const previous = begin(consumer);
    prepare(sources, consumer);
    resolveTrackedRead(novel, consumer);
    // The head start reads two links; the certificate stops there.
    expect(reads() <= 3, `reads ${reads()}`).toBe(true);
    expect(pairs(consumer, novel)).toBe(1);
    expect(isCell(novel, consumer) && leased(novel)).toBe(true);

    // Another consumer links the producer after the owner: its newest edge
    // no longer answers the owner, the cell does.
    const other = node(Consumer);
    const saved = begin(other);
    resolveTrackedRead(novel, other);
    end(other, saved);
    resolveTrackedRead(sources[5]!, consumer);
    resolveTrackedRead(novel, consumer);
    expect(pairs(consumer, novel)).toBe(1);
    end(consumer, previous);

    expect(sourcesOf(consumer, [...sources, novel])).toEqual([
      128, 200, 256, 5,
    ]);
    expectGraphIntegrity([...sources, novel, consumer]);
  });

  it("searches instead of certifying when a producer could not take its cell", () => {
    const { sources, consumer } = wideGraph();
    const { novel, reads } = countedNovel(97);
    // Stands for an ancestor still on the stack: its slot is a frontier.
    sources[9]!.state |= Computing;
    const previous = begin(consumer);
    prepare(sources, consumer);
    expect(sources[9]!.tailIn).toBe(null);
    resolveTrackedRead(novel, consumer);
    sources[9]!.state &= ~Computing;
    expect(reads() > 3, "searched").toBe(true);
    end(consumer, previous);
    expect(sourcesOf(consumer, [...sources, novel])).toEqual([128, 200, 256]);
    expectGraphIntegrity([...sources, novel, consumer]);
  });

  it("strikes on a finger hit in the far end of the window, not the near end", () => {
    for (const offset of [1, 4]) {
      // Each producer: 20 subscribers, the finger's consumer, 3 more, then
      // (at finger + offset) the consumer, then 15 more.
      const producers = range(40).map(() => node());
      const consumer = node(Consumer);
      const finger = node(Consumer);
      for (const p of producers) {
        for (let i = 0; i < 20; i++) linkEdge(p, node(Consumer));
        linkEdge(p, finger);
        for (let i = 1; i < offset; i++) linkEdge(p, node(Consumer));
        linkEdge(p, consumer);
        for (let i = offset; i < 19; i++) linkEdge(p, node(Consumer));
      }
      const first = begin(consumer);
      for (const p of producers) resolveTrackedRead(p, consumer);
      end(consumer, first);
      for (const p of producers) p.tailIn = edgeOf(p, finger);

      const previous = begin(consumer);
      resolveTrackedRead(producers[30]!, consumer);
      resolveTrackedRead(producers[20]!, consumer);
      const tape = producers.every((p) => isCell(p, consumer));
      end(consumer, previous);
      // 4 links after the finger is its 7th probe (step 12): far.
      expect(tape, `offset ${offset}`).toBe(offset === 4);
      expectUniquePairs(consumer);
    }
  });

  it("a nested consumer neither takes the lease nor makes a twin", () => {
    const sources = range(256).map(() => node());
    const add = (count: number) => {
      for (let i = 0; i < count; i++) {
        const o = node(Consumer);
        for (const s of sources) linkEdge(s, o);
      }
    };
    add(48);
    const inner = node(Consumer);
    for (const s of sources) linkEdge(s, inner);
    add(48);
    const outer = node(Consumer);
    for (const s of sources) linkEdge(s, outer);
    add(1);
    const outerEdges = new Map(incomingEdges(outer).map((e) => [e.from, e]));

    const { novel, reads } = countedNovel(97);
    const previous = begin(outer);
    prepare(sources, outer);
    const saved = begin(inner);
    for (const j of shuffled(range(256), 11))
      resolveTrackedRead(sources[j]!, inner);
    end(inner, saved);
    // The inner pass struck often and wrote hints over the outer cells, but
    // the lease is still the outer pass's: its covered miss certifies.
    resolveTrackedRead(novel, outer);
    expect(reads() <= 3, `reads ${reads()}`).toBe(true);
    for (const j of shuffled(range(256), 13))
      resolveTrackedRead(sources[j]!, outer);
    end(outer, previous);
    expect(pairs(outer, novel)).toBe(1);

    expectUniquePairs(outer);
    expectUniquePairs(inner);
    expect(
      incomingEdges(outer).every(
        (e) => e.from === novel || outerEdges.get(e.from) === e,
      ),
    ).toBe(true);
    expectGraphIntegrity([...sources, inner, outer]);
  });

  it("a lost cell costs a search, never a twin", () => {
    for (const loss of ["raw-frame", "sources", "hint"] as const) {
      const { sources, consumer } = wideGraph();
      const p = sources[60]!;
      if (loss === "sources") linkEdge(node(), p);
      const previous = begin(consumer);
      prepare(sources, consumer);
      expect(isCell(p, consumer)).toBe(true);
      if (loss === "raw-frame") {
        // A frame opened by hand clears the slot unseen; the bit survives.
        const saved = begin(p);
        end(p, saved);
      } else if (loss === "sources") {
        unlinkAllSources(p);
      } else {
        p.tailIn = edgeOf(p, outgoingEdges(p)[3]!.to);
      }
      expect(isCell(p, consumer)).toBe(false);
      resolveTrackedRead(p, consumer);
      for (let j = 0; j <= 60; j++) resolveTrackedRead(sources[j]!, consumer);
      end(consumer, previous);
      expect(pairs(consumer, p), loss).toBe(1);
      expectUniquePairs(consumer);
      expectGraphIntegrity([...sources, consumer]);
    }
  });

  it("a producer recomputing under the lease is never certified absent", () => {
    const { sources, consumer } = wideGraph();
    const p = sources[60]!;
    const previous = begin(consumer);
    prepare(sources, consumer);
    const cell = edgeOf(p, consumer);
    // Its own computation holds the slot as a frontier while it reads
    // itself into the suspended owner (a context switch would).
    p.compute = () => {
      resolveTrackedRead(p, consumer);
    };
    advance(p);
    p.compute = undefined;
    expect(pairs(consumer, p)).toBe(1);
    end(consumer, previous);
    expect(sourcesOf(consumer, sources)).toEqual([128, 200, 60]);
    expect(incomingEdges(consumer)[2] === cell).toBe(true);
    expectGraphIntegrity([...sources, consumer]);
  });

  it("a lease dies with its pass: the next pass searches, and the bits are cleared", () => {
    const { sources, consumer } = wideGraph();
    const { novel, reads } = countedNovel(97);
    let previous = begin(consumer);
    prepare(sources, consumer);
    end(consumer, previous);

    previous = begin(consumer);
    resolveTrackedRead(novel, consumer);
    expect(reads() > 3, "a new stamp is a new pass: no certificate").toBe(true);
    // The stale miss released the lease.
    expect(leased(sources[128]!) || leased(sources[200]!)).toBe(false);
    for (let j = 0; j < 256; j++) resolveTrackedRead(sources[j]!, consumer);
    end(consumer, previous);
    expect(sourcesOf(consumer, [...sources, novel])).toEqual([
      256,
      ...range(256),
    ]);
    expectGraphIntegrity([...sources, novel, consumer]);
  });

  it("computed producers recomputing inside a prepared pass (public API)", () => {
    const signals = range(256).map((i) => createProducer(i));
    const mids = signals.map((s) => createConsumer(() => readProducer(s) + 1));
    const wide = (order: () => readonly number[]) =>
      createConsumer(() => {
        let sum = 0;
        for (const j of order()) sum += readConsumer(mids[j]!) as number;
        return sum;
      });
    const fixed = range(256);
    let order: readonly number[] = fixed;
    const others = range(97).map(() => wide(() => fixed));
    const target = wide(() => order);
    for (const o of others.slice(0, 96)) readConsumer(o);
    readConsumer(target);
    readConsumer(others[96]!);
    const before = new Map(incomingEdges(target).map((e) => [e.from, e]));

    for (let i = 0; i < 256; i++) writeProducer(signals[i]!, i + 1000);
    order = shuffled(range(256), 5);
    expect(readConsumer(target)).toBe(
      range(256).reduce((s, i) => s + i + 1001, 0),
    );
    expect(sourcesOf(target, mids)).toEqual(order);
    expect(incomingEdges(target).every((e) => before.get(e.from) === e)).toBe(
      true,
    );
    expectGraphIntegrity(mids);
  });

  it("a throw in a prepared pass leaves every edge, and the retry reuses them", () => {
    const { sources } = wideGraph();
    let order = range(256);
    let fail = false;
    const failure = new Error("expected");
    const c = createConsumer(() => {
      for (const j of order) readProducer(sources[j]!);
      if (fail) throw failure;
      return order.length;
    });
    readConsumer(c);
    const before = new Set<ReactiveEdge>(incomingEdges(c));
    // Hints for c from its first pass would settle the far reads at L1.
    for (const s of sources) s.tailIn = null;
    order = [128, 200, 7];
    fail = true;
    c.state |= 2; // Changed
    expect(() => readConsumer(c)).toThrow(failure);
    expect(incomingEdges(c).length).toBe(256);
    expect(incomingEdges(c).every((e) => before.has(e))).toBe(true);
    fail = false;
    expect(readConsumer(c)).toBe(3);
    expect(sourcesOf(c, sources)).toEqual(order);
    expect(incomingEdges(c).every((e) => before.has(e))).toBe(true);
    expectGraphIntegrity([...sources, c]);
  });
});
