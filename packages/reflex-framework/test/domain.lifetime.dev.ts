import { describe, expect, it } from "vitest";
import {
  createConsumer,
  createExecutionDomain,
  readConsumer,
  runWatcher,
  type WatcherNode,
} from "@volynets/reflex-runtime";
import {
  BorrowError,
  createManagedRoot,
  createOwnedComputed,
  createOwnedEffect,
  createOwnedSignal,
  createOwnershipNode,
  disposeOwnershipNode,
  isReleased,
  lease,
  ReleasedResourceError,
  runManaged,
  runWithOwnershipNode,
  transfer,
  type OwnershipNode,
} from "../src";

function setup() {
  const queue: WatcherNode[] = [];
  const domain = createExecutionDomain({
    scheduler: {
      onNodeInvalidated: (node) => void queue.push(node as WatcherNode),
      flush() {
        while (queue.length !== 0) runWatcher(queue.shift()!);
      },
    },
  });
  const root = createManagedRoot(domain);
  const scope = (parent: OwnershipNode = root.node): OwnershipNode => {
    const node = createOwnershipNode();
    root.run(() =>
      runWithOwnershipNode(root.owner, parent, () => {
        runWithOwnershipNode(root.owner, node, () => {});
      }),
    );
    return node;
  };
  // Enter an existing scope without re-parenting it.
  const inScope = <T>(node: OwnershipNode, fn: () => T): T =>
    runManaged(root.owner, node, fn);
  return { domain, root, scope, inScope };
}

describe("borrow and lifetime rules (O2, DEV)", () => {
  it("lets descendants read ancestor-owned values", () => {
    const { root, scope, inScope } = setup();
    const signal = root.run(() => createOwnedSignal(root.owner, 1));
    const child = scope();
    const seen: number[] = [];

    inScope(child, () =>
      createOwnedEffect(root.owner, child, () => void seen.push(signal())),
    );
    root.run(() => signal.set(2));
    root.domain.flush();

    expect(seen).toEqual([1, 2]);
  });

  it("rejects a sibling-owned read", () => {
    const { root, scope, inScope } = setup();
    const left = scope();
    const right = scope();
    const signal = inScope(left, () => createOwnedSignal(root.owner, 1));

    expect(() => inScope(right, () => signal())).toThrow(BorrowError);
  });

  it("rejects a child-owned read from the parent", () => {
    const { root, scope, inScope } = setup();
    const child = scope();
    const signal = inScope(child, () => createOwnedSignal(root.owner, 1));

    expect(() => root.run(() => signal())).toThrow(BorrowError);
  });

  it("allows a leased read and keeps the value live until the lease ends", () => {
    const { root, scope, inScope } = setup();
    const left = scope();
    const right = scope();
    const signal = inScope(left, () => createOwnedSignal(root.owner, 7));
    const end = lease(signal, right);

    expect(inScope(right, () => signal())).toBe(7);

    disposeOwnershipNode(left);
    expect(isReleased(signal)).toBe(false);
    expect(inScope(right, () => signal())).toBe(7);

    end();
    expect(isReleased(signal)).toBe(true);
    expect(() => signal()).toThrow(ReleasedResourceError);
  });

  it("ends a lease when the borrower closes", () => {
    const { root, scope, inScope } = setup();
    const left = scope();
    const right = scope();
    const signal = inScope(left, () => createOwnedSignal(root.owner, 1));
    lease(signal, right);

    disposeOwnershipNode(left);
    expect(isReleased(signal)).toBe(false);
    disposeOwnershipNode(right);
    expect(isReleased(signal)).toBe(true);
  });

  it("moves ownership with transfer()", () => {
    const { root, scope, inScope } = setup();
    const child = scope();
    const signal = inScope(child, () => createOwnedSignal(root.owner, 3));

    root.run(() => transfer(signal, root.owner));
    disposeOwnershipNode(child);

    expect(isReleased(signal)).toBe(false);
    expect(root.run(() => signal())).toBe(3);
  });

  it("refuses to transfer across domains", () => {
    const a = setup();
    const b = setup();
    const signal = a.root.run(() => createOwnedSignal(a.root.owner, 1));

    expect(() => b.root.run(() => transfer(signal, b.root.owner))).toThrow(
      BorrowError,
    );
  });

  it.each(["clean", "dirty"])(
    "disposes a borrowing descendant together with the owner (%s)",
    (consumerState) => {
      const { root, scope, inScope } = setup();
      const owner = scope();
      const reader = scope(owner);
      const signal = inScope(owner, () => createOwnedSignal(root.owner, 1));
      const doubled = inScope(reader, () =>
        createOwnedComputed(root.owner, () => signal() * 2),
      );
      expect(inScope(reader, () => doubled())).toBe(2);
      if (consumerState === "dirty") root.run(() => signal.set(5));

      disposeOwnershipNode(owner);

      expect(isReleased(signal)).toBe(true);
      expect(isReleased(doubled)).toBe(true);
      expect(() => doubled()).toThrow(ReleasedResourceError);
    },
  );

  it("drops a borrowed dependency when a dynamic branch stops reading it", () => {
    const { root, scope, inScope } = setup();
    const left = scope();
    const right = scope();
    const borrowed = inScope(left, () => createOwnedSignal(root.owner, 1));
    const end = lease(borrowed, right);
    const useBorrowed = inScope(right, () =>
      createOwnedSignal(root.owner, true),
    );
    const value = inScope(right, () =>
      createOwnedComputed(root.owner, () => (useBorrowed() ? borrowed() : 0)),
    );

    expect(inScope(right, () => value())).toBe(1);
    inScope(right, () => useBorrowed.set(false));
    expect(inScope(right, () => value())).toBe(0);

    end();
    disposeOwnershipNode(left);
    expect(isReleased(borrowed)).toBe(true);
    expect(inScope(right, () => value())).toBe(0);
  });

  it("releases graph nodes at the domain safe point (L2)", () => {
    const { root, scope, inScope } = setup();
    const child = scope();
    const signal = inScope(child, () => createOwnedSignal(root.owner, 1));
    const probe = createConsumer(() => signal());
    inScope(child, () => readConsumer(probe));
    expect(probe.firstIn).not.toBeNull();
    let linkedInside: boolean | undefined;

    root.run(() => {
      disposeOwnershipNode(child);
      expect(isReleased(signal)).toBe(true);
      linkedInside = probe.firstIn !== null;
    });

    expect(linkedInside).toBe(true);
    expect(probe.firstIn).toBeNull();
  });
});
