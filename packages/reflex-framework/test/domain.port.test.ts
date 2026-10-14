import { describe, expect, it } from "vitest";
import {
  createConsumer,
  createExecutionDomain,
  createProducer,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
  type WatcherNode,
} from "@volynets/reflex-runtime";
import {
  createManagedRoot,
  createOwnedEffect,
  createPort,
  PortClosedError,
  PortOverflowError,
  PortTopologyError,
  type ManagedRoot,
} from "../src";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A domain whose watchers run at every idle boundary (eager-like). */
function app(): ManagedRoot {
  const queue: WatcherNode[] = [];
  const flush = () => {
    while (queue.length !== 0) runWatcher(queue.shift()!);
  };
  return createManagedRoot(
    createExecutionDomain({
      scheduler: {
        onNodeInvalidated: (node) => void queue.push(node as WatcherNode),
        onRuntimeIdle: flush,
        flush,
      },
    }),
  );
}

function observe<T>(root: ManagedRoot, read: () => T): T[] {
  const seen: T[] = [];
  root.run(() =>
    createOwnedEffect(root.owner, root.node, () => void seen.push(read())),
  );
  return seen;
}

describe("domain ports (P1, P2)", () => {
  it("delivers eventually into the target domain, or now on flush", async () => {
    const a = app();
    const b = app();
    const port = createPort<number>(a, b);
    const seen = observe(b, () => port.read());

    a.run(() => port.publish(1));
    expect(port.local.payload).toBeUndefined();
    await tick();
    expect(seen).toEqual([undefined, 1]);
    expect(port.version).toBe(1);

    a.run(() => port.publish(2));
    port.flush();
    expect(seen).toEqual([undefined, 1, 2]);
  });

  it("coalesces to the latest pending version by default", async () => {
    const a = app();
    const b = app();
    const port = createPort<number>(a, b);
    const seen = observe(b, () => port.read());

    a.run(() => {
      port.publish(1);
      port.publish(2);
      port.publish(3);
    });
    await tick();

    expect(seen).toEqual([undefined, 3]);
    expect(port.version).toBe(3);
    expect(port.published).toBe(3);
  });

  it("delivers every version in order with fifo, bounded by capacity", async () => {
    const a = app();
    const b = app();
    const port = createPort<number>(a, b, { delivery: "fifo", capacity: 3 });
    const seen = observe(b, () => port.read());

    a.run(() => {
      port.publish(1);
      port.publish(2);
      port.publish(3);
      expect(() => port.publish(4)).toThrow(PortOverflowError);
    });
    await tick();

    expect(seen).toEqual([undefined, 1, 2, 3]);
  });

  it("drops duplicate and out-of-order external deliveries", () => {
    const a = app();
    const b = app();
    const port = createPort<string>(a, b);

    expect(port.deliver({ version: 2, value: "two" })).toBe(true);
    expect(port.deliver({ version: 1, value: "one" })).toBe(false);
    expect(port.deliver({ version: 2, value: "again" })).toBe(false);
    expect(port.deliver({ version: 3, value: "three" })).toBe(true);

    expect(port.local.payload).toBe("three");
    expect(port.version).toBe(3);
  });

  it("drops queued messages on close and rejects later publishes", async () => {
    const a = app();
    const b = app();
    const port = createPort<number>(a, b);

    a.run(() => port.publish(1));
    port.close();
    port.close();
    await tick();

    expect(port.local.payload).toBeUndefined();
    expect(() => port.publish(2)).toThrow(PortClosedError);
  });

  it("closes with either endpoint", async () => {
    const a = app();
    const b = app();
    const c = app();
    const fromSource = createPort<number>(a, b);
    const fromTarget = createPort<number>(c, b);

    a.dispose();
    expect(fromSource.closed).toBe(true);
    expect(fromTarget.closed).toBe(false);

    c.run(() => fromTarget.publish(1));
    b.domain.close();
    await tick();
    expect(fromTarget.closed).toBe(true);
    expect(fromTarget.local.payload).toBeUndefined();
  });

  it("keeps ports a DAG unless feedback is explicit", () => {
    const a = app();
    const b = app();
    const c = app();
    const ab = createPort(a, b);
    const bc = createPort(b, c);

    expect(() => createPort(c, a)).toThrow(PortTopologyError);
    expect(() => createPort(b, a)).toThrow(PortTopologyError);
    expect(() => createPort(c, a, { feedback: "allow" })).not.toThrow();

    bc.close();
    expect(() => createPort(c, a)).not.toThrow();
    ab.close();
  });

  it("isolates the mirror from later payload mutation with clone", async () => {
    const a = app();
    const b = app();
    const port = createPort<{ items: number[] }>(a, b, { payload: "clone" });
    const value = { items: [1] };

    a.run(() => port.publish(value));
    value.items.push(2);
    await tick();

    expect(port.local.payload).toEqual({ items: [1] });
  });

  it("never exposes a partial pair through one snapshot port (litmus 8)", async () => {
    const a = app();
    const b = app();
    const xPort = createPort<number>(a, b);
    const yPort = createPort<number>(a, b);
    const pairPort = createPort<{ x: number; y: number }>(a, b);
    const split = observe(b, () => [xPort.read(), yPort.read()].join(","));
    const whole = observe(b, () => {
      const pair = pairPort.read();
      return pair === undefined ? "" : `${pair.x},${pair.y}`;
    });

    a.run(() => {
      xPort.publish(1);
      yPort.publish(1);
      pairPort.publish({ x: 1, y: 1 });
    });
    await tick();

    // Separate ports may expose a glitch; the snapshot port never does.
    expect(split).toContain("1,");
    expect(whole).toEqual(["", "1,1"]);
  });

  it("creates no reactive edge between the domains", async () => {
    const a = app();
    const b = app();
    const source = createProducer(1);
    const port = createPort<number>(a, b);
    const mirror = b.run(() => createConsumer(() => (port.read() ?? 0) * 2));
    const publisher = a.run(() =>
      createOwnedEffect(a.owner, a.node, () =>
        port.publish(readProducer(source)),
      ),
    );

    await tick();
    expect(b.run(() => readConsumer(mirror))).toBe(2);
    a.run(() => writeProducer(source, 5));
    await tick();
    expect(b.run(() => readConsumer(mirror))).toBe(10);

    // Only the source's own watcher depends on it; the mirror has no writer edge.
    expect(source.firstOut?.nextOut ?? null).toBeNull();
    expect(port.local.firstIn).toBeNull();
    expect(port.local.firstOut?.to).toBe(mirror);
    publisher();
  });

  it("relays through a chain when publishing from a delivery callback", async () => {
    const a = app();
    const b = app();
    const c = app();
    const ab = createPort<number>(a, b);
    const bc = createPort<number>(b, c);
    b.run(() =>
      createOwnedEffect(b.owner, b.node, () => {
        const value = ab.read();
        if (value !== undefined) bc.publish(value + 1);
      }),
    );
    const seen = observe(c, () => bc.read());

    a.run(() => ab.publish(1));
    await tick();
    await tick();

    expect(seen).toEqual([undefined, 2]);
  });
});
