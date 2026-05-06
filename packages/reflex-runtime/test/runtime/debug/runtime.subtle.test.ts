import { beforeEach, describe, expect, it } from "vitest";
import {
  RUNTIME_DEBUG_PROTOCOL_VERSION,
  subtle as debugSubtle,
} from "../../runtime.test_utils/debug";
import {
  readConsumer,
  readProducer,
  runWatcher,
  subtle,
  untracked,
} from "../../runtime.test_utils";
import {
  createConsumer,
  createProducer,
  createWatcher,
  hasSubscriber,
  incomingSources,
  resetRuntime,
} from "../../runtime.test_utils";

/** Covers the public subtle/debug surface and its graph introspection helpers. */
describe("Reactive runtime - subtle debug surface", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("exposes untrack as a subtle alias", () => {
    const source = createProducer(1);
    const consumer = createConsumer(() =>
      subtle.untrack(() => readProducer(source)),
    );

    readConsumer(consumer);

    expect(incomingSources(consumer)).toEqual([]);
    expect(hasSubscriber(source, consumer)).toBe(false);
  });

  it("reports the current computed while a computed is evaluating", () => {
    const source = createProducer(2);
    let current = undefined;

    const consumer = createConsumer(() => {
      current = subtle.currentComputed();
      return readProducer(source) * 2;
    });

    expect(subtle.currentComputed()).toBeUndefined();
    readConsumer(consumer);

    expect(current).toBe(consumer);
    expect(subtle.currentComputed()).toBeUndefined();
  });

  it("introspects sources and sinks in graph order", () => {
    const a = createProducer(1);
    const b = createProducer(2);
    const sum = createConsumer(() => readProducer(a) + readProducer(b));
    const watcher = createWatcher(() => {
      readConsumer(sum);
    });

    readConsumer(sum);
    expect(subtle.introspectSources(sum)).toEqual([a, b]);
    expect(subtle.introspectSinks(a)).toEqual([sum]);
    expect(subtle.hasSources(sum)).toBe(true);
    expect(subtle.hasSinks(a)).toBe(true);
    runWatcher(watcher);
    expect(subtle.introspectSinks(sum)).toEqual([watcher]);
  });

  it("reports watcher sinks and nodes without dependencies", () => {
    const source = createProducer(1);
    const watcher = createWatcher(() => {
      readProducer(source);
      return () => {};
    });

    expect(subtle.hasSinks(source)).toBe(false);
    expect(subtle.hasSources(watcher)).toBe(false);

    runWatcher(watcher);

    expect(subtle.introspectSinks(source)).toEqual([watcher]);
    expect(subtle.hasSinks(source)).toBe(true);
    expect(subtle.hasSources(watcher)).toBe(true);
  });

  it("snapshots graph nodes and edges with strict edge order metadata", () => {
    const a = createProducer(1);
    const b = createProducer(2);
    const sum = createConsumer(() => readProducer(a) + readProducer(b));
    const watcher = createWatcher(() => {
      readConsumer(sum);
    });

    readConsumer(sum);
    runWatcher(watcher);

    const graph = subtle.graph(sum);

    expect(graph.root.payload).toBe(3);
    expect(graph.nodes.map((node) => node.payload)).toEqual([
      3,
      1,
      2,
      undefined,
    ]);
    expect(
      graph.edges.map((edge) => [
        edge.from.payload,
        edge.to.payload,
        edge.incomingIndex,
        edge.outgoingIndex,
      ]),
    ).toEqual([
      [1, 3, 0, 0],
      [2, 3, 1, 0],
      [3, undefined, 0, 0],
    ]);
  });

  it("can snapshot only sources or sinks within a bounded depth", () => {
    const source = createProducer(1);
    const middle = createConsumer(() => readProducer(source) + 1);
    const sink = createConsumer(() => readConsumer(middle) + 1);

    readConsumer(sink);

    expect(
      subtle
        .graph(middle, { direction: "sources", depth: 1 })
        .nodes.map((node) => node.payload),
    ).toEqual([2, 1]);
    expect(
      subtle
        .graph(middle, { direction: "sinks", depth: 1 })
        .nodes.map((node) => node.payload),
    ).toEqual([2, 3]);
  });

  it("checks graph edge list integrity", () => {
    const source = createProducer(1);
    const sink = createConsumer(() => readProducer(source));

    readConsumer(sink);

    expect(subtle.graphIntegrity(source)).toEqual({
      ok: true,
      issues: [],
    });

    const edge = source.firstOut;
    expect(edge).not.toBeNull();

    if (edge !== null) {
      edge.prevOut = edge;
    }

    const integrity = subtle.graphIntegrity(source);

    expect(integrity.ok).toBe(false);
    expect(integrity.issues.map((issue) => issue.code)).toContain(
      "invalid-prev-out",
    );
  });

  it("opens a versioned debug protocol session", () => {
    const messages: string[] = [];
    const source = createProducer(1);

    debugSubtle.configure({ historyLimit: 10 });
    const session = debugSubtle.session();
    const unsubscribe = session.observe((message) => {
      messages.push(message.type);
    });

    expect(session.handshake()).toMatchObject({
      protocolVersion: RUNTIME_DEBUG_PROTOCOL_VERSION,
    });
    expect(messages).toEqual(["debug:handshake"]);

    readProducer(source);
    session.snapshot({ graph: debugSubtle.graph(source) });

    expect(messages).toEqual([
      "debug:handshake",
      "debug:event",
      "debug:snapshot",
    ]);

    unsubscribe();
    session.destroy();
  });

  it("matches the standalone untracked helper", () => {
    const source = createProducer(10);

    expect(subtle.untrack(() => readProducer(source))).toBe(
      untracked(() => readProducer(source)),
    );
  });
});



