import { describe, expect, it } from "vitest";
import {
  Changed,
  Consumer,
  Disposed,
  Invalid,
  PROMOTE_CHANGED,
  PROMOTE_INVALID,
  ReactiveNode,
  Reentrant,
  Tracking,
  Watcher,
} from "../src/reactivity";
import { linkEdge } from "../src/reactivity/shape/methods/connect";
import { invalidateSubscriber } from "../src/reactivity/walkers/propagate.invalidate";
import { resetRuntime } from "./runtime.test_utils";

function createNode(state: number): ReactiveNode {
  return new ReactiveNode(undefined, null, state);
}

describe("Reactive runtime - invalidateSubscriber transition matrix", () => {
  it.each([
    {
      name: "clean consumer promotes to Changed",
      initial: Consumer,
      promote: PROMOTE_CHANGED,
      expected: Consumer | Changed,
    },
    {
      name: "clean consumer promotes to Invalid",
      initial: Consumer,
      promote: PROMOTE_INVALID,
      expected: Consumer | Invalid,
    },
    {
      name: "clean watcher promotes and keeps watcher bit",
      initial: Watcher,
      promote: PROMOTE_CHANGED,
      expected: Watcher | Changed,
    },
    {
      name: "stale Visited is cleared on fast path",
      initial: Consumer | Reentrant,
      promote: PROMOTE_CHANGED,
      expected: Consumer | Changed,
    },
  ])("$name", ({ initial, promote, expected }) => {
    resetRuntime();

    const source = createNode(0);
    const subscriber = createNode(initial);
    const edge = linkEdge(source, subscriber);

    expect(invalidateSubscriber(edge, subscriber, subscriber.state, promote)).toBe(
      expected,
    );
    expect(subscriber.state).toBe(expected);
  });

  it.each([
    {
      name: "already Invalid",
      initial: Consumer | Invalid,
    },
    {
      name: "already Changed",
      initial: Consumer | Changed,
    },
    {
      name: "disposed clean node",
      initial: Consumer | Disposed,
    },
    {
      name: "disposed dirty node",
      initial: Consumer | Disposed | Invalid,
    },
  ])("returns 0 and preserves state for $name", ({ initial }) => {
    resetRuntime();

    const source = createNode(0);
    const subscriber = createNode(initial);
    const edge = linkEdge(source, subscriber);

    expect(
      invalidateSubscriber(edge, subscriber, subscriber.state, PROMOTE_CHANGED),
    ).toBe(0);
    expect(subscriber.state).toBe(initial);
  });

  it("returns 0 and preserves state for tracking subscribers without a prefix tail", () => {
    resetRuntime();

    const source = createNode(0);
    const subscriber = createNode(Consumer | Tracking);
    const edge = linkEdge(source, subscriber);

    expect(
      invalidateSubscriber(edge, subscriber, subscriber.state, PROMOTE_CHANGED),
    ).toBe(0);
    expect(subscriber.state).toBe(Consumer | Tracking);
  });

  it.each([
    {
      name: "inbound edge is the tracked tail",
      inboundIndex: 1,
      tailIndex: 1,
      expectedChanged: true,
    },
    {
      name: "inbound edge is before the tracked tail",
      inboundIndex: 0,
      tailIndex: 2,
      expectedChanged: true,
    },
    {
      name: "inbound edge immediately follows the tracked tail",
      inboundIndex: 2,
      tailIndex: 1,
      expectedChanged: false,
    },
    {
      name: "inbound edge is after the tracked tail",
      inboundIndex: 3,
      tailIndex: 1,
      expectedChanged: false,
    },
  ])(
    "$name",
    ({ inboundIndex, tailIndex, expectedChanged }) => {
      resetRuntime();

      const subscriber = createNode(Consumer | Tracking);
      const sources = [
        createNode(0),
        createNode(0),
        createNode(0),
        createNode(0),
      ];
      const edges = sources.map((source) => linkEdge(source, subscriber));
      const initial = subscriber.state;
      subscriber.lastInTail = edges[tailIndex]!;

      const nextState = invalidateSubscriber(
        edges[inboundIndex]!,
        subscriber,
        subscriber.state,
        PROMOTE_CHANGED,
      );

      if (expectedChanged) {
        const expected = Consumer | Tracking | Reentrant | Invalid;
        expect(nextState).toBe(expected);
        expect(subscriber.state).toBe(expected);
      } else {
        expect(nextState).toBe(0);
        expect(subscriber.state).toBe(initial);
      }
    },
  );
});
