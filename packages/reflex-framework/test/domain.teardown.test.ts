import { describe, expect, it, vi } from "vitest";
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
  createOwnerContext,
  createOwnershipNode,
  disposeOwnershipNode,
  runManaged,
  runWithOwnershipNode,
  type OwnerContext,
  type OwnershipNode,
} from "../src";

function setup(withDomain: boolean) {
  const queue: WatcherNode[] = [];
  const flushQueue = () => {
    while (queue.length !== 0) runWatcher(queue.shift()!);
  };
  const domain = createExecutionDomain({
    scheduler: {
      onNodeInvalidated: (node) => void queue.push(node as WatcherNode),
      flush: flushQueue,
    },
  });
  const root = createManagedRoot(domain);
  const owner: OwnerContext = withDomain ? root.owner : createOwnerContext();
  const enter = <T>(node: OwnershipNode, fn: () => T): T =>
    withDomain ? runManaged(owner, node, fn) : domain.run(() => fn());
  const scope = (): OwnershipNode => {
    const node = createOwnershipNode();
    if (withDomain) root.run(() => runWithOwnershipNode(owner, node, () => {}));
    return node;
  };
  return { domain, root, owner, enter, scope, queue };
}

describe("two-phase disposal at execution safe points (L2)", () => {
  it.each([true, false])(
    "disposes an effect from inside its own pull validation (domain: %s)",
    (withDomain) => {
      const { domain, owner, enter, scope } = setup(withDomain);
      const effectScope = scope();
      const source = createProducer(0);
      let killDuringValidation = false;
      const middle = createConsumer(() => {
        const value = readProducer(source);
        if (killDuringValidation) disposeOwnershipNode(effectScope);
        return value;
      });
      const upper = createConsumer(() => readConsumer(middle) + 1);
      const runs: number[] = [];
      const cleanups = vi.fn();

      enter(effectScope, () =>
        createOwnedEffect(owner, effectScope, () => {
          runs.push(readConsumer(upper));
          return cleanups;
        }),
      );

      killDuringValidation = true;
      enter(effectScope, () => writeProducer(source, 1));
      domain.flush();
      enter(effectScope, () => writeProducer(source, 2));
      domain.flush();

      expect(runs).toEqual([1]);
      expect(cleanups).toHaveBeenCalledTimes(1);
      expect(source.firstOut?.to).not.toBeUndefined();
    },
  );

  it("closes logically at once and unlinks at the outermost exit", () => {
    const { domain, root, owner, scope } = setup(true);
    const effectScope = scope();
    const source = createProducer(0);
    const runs: number[] = [];
    const order: string[] = [];
    let watcherEdge: unknown;

    root.run(() =>
      runManaged(owner, effectScope, () =>
        createOwnedEffect(owner, effectScope, () => {
          runs.push(readProducer(source));
          return () => order.push("cleanup");
        }),
      ),
    );
    watcherEdge = source.firstOut;

    root.run(() => {
      disposeOwnershipNode(effectScope);
      order.push("after dispose");
      // Graph unlink waits for the safe point.
      expect(source.firstOut).toBe(watcherEdge);
      // A write before the safe point must not re-run the closed effect.
      writeProducer(source, 1);
      domain.flush();
    });

    expect(order).toEqual(["cleanup", "after dispose"]);
    expect(runs).toEqual([0]);
    expect(source.firstOut).toBeNull();
  });

  it("disposes an effect while its own callback runs", () => {
    const { domain, root, owner, scope } = setup(true);
    const effectScope = scope();
    const source = createProducer(0);
    const order: string[] = [];

    root.run(() =>
      runManaged(owner, effectScope, () =>
        createOwnedEffect(owner, effectScope, () => {
          const value = readProducer(source);
          order.push(`run:${value}`);
          if (value === 1) disposeOwnershipNode(effectScope);
          return () => order.push(`cleanup:${value}`);
        }),
      ),
    );
    root.run(() => writeProducer(source, 1));
    domain.flush();
    root.run(() => writeProducer(source, 2));
    domain.flush();

    expect(order).toEqual(["run:0", "cleanup:0", "run:1", "cleanup:1"]);
    expect(source.firstOut).toBeNull();
  });

  it("A -> B -> dispose(A) -> A resume keeps the outer continuation", () => {
    const a = setup(true);
    const b = setup(true);
    const effectScope = a.scope();
    const source = createProducer(0);
    const runs: string[] = [];

    a.root.run(() =>
      runManaged(a.owner, effectScope, () =>
        createOwnedEffect(a.owner, effectScope, () => {
          const value = readProducer(source);
          runs.push(`a:${value}`);
          if (value === 1) {
            b.root.run(() => disposeOwnershipNode(effectScope));
            runs.push("resumed");
          }
        }),
      ),
    );
    a.root.run(() => writeProducer(source, 1));
    a.domain.flush();

    expect(runs).toEqual(["a:0", "a:1", "resumed"]);
    expect(source.firstOut).toBeNull();
  });

  it("runs throwing cleanups once and still unlinks", () => {
    const { root, owner, scope } = setup(true);
    const effectScope = scope();
    const source = createProducer(0);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cleanup = vi.fn(() => {
      throw new Error("cleanup failed");
    });

    root.run(() =>
      runManaged(owner, effectScope, () =>
        createOwnedEffect(owner, effectScope, () => {
          readProducer(source);
          return cleanup;
        }),
      ),
    );
    root.run(() => {
      disposeOwnershipNode(effectScope);
      disposeOwnershipNode(effectScope);
    });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(source.firstOut).toBeNull();
    error.mockRestore();
  });

  it("keeps the queue bounded across repeated create/dispose cycles", () => {
    const { domain, root, owner, queue } = setup(true);
    const source = createProducer(0);

    for (let cycle = 0; cycle < 50; cycle++) {
      const node = createOwnershipNode();
      root.run(() =>
        runWithOwnershipNode(owner, node, () =>
          createOwnedEffect(owner, node, () => void readProducer(source)),
        ),
      );
      root.run(() => {
        writeProducer(source, cycle + 1);
        disposeOwnershipNode(node);
      });
      domain.flush();
    }

    expect(queue).toHaveLength(0);
    expect(source.firstOut).toBeNull();
  });
});
