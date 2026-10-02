import { describe, expect, it, vi } from "vitest";
import {
  addCleanup,
  createOwnerContext,
  createOwnershipNode,
  disposeOwnershipNode,
  getLifetimeSignal,
  LifecycleScope,
  runWithOwnershipNode,
  useAbortSignal,
  useEffect,
} from "../src";
import { createRuntimeHarness, createTestProducer } from "./runtime";

describe("ownership cancellation", () => {
  it("shares a signal within one owner, isolates owners and aborts only once", () => {
    const first = createOwnershipNode();
    const second = createOwnershipNode();
    const signal = getLifetimeSignal(first);
    const onAbort = vi.fn();
    signal.addEventListener("abort", onAbort);
    expect(getLifetimeSignal(first)).toBe(signal);
    expect(getLifetimeSignal(second)).not.toBe(signal);
    expect(signal.aborted).toBe(false);
    disposeOwnershipNode(first);
    disposeOwnershipNode(first);
    expect(signal.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(getLifetimeSignal(first)).toBe(signal);
    expect(getLifetimeSignal(second).aborted).toBe(false);
    disposeOwnershipNode(second);
  });

  it("returns an aborted signal even when first requested during or after cleanup", () => {
    const node = createOwnershipNode();
    let during: AbortSignal | undefined;
    addCleanup(node, () => {
      during = getLifetimeSignal(node);
      expect(during.aborted).toBe(true);
    });
    disposeOwnershipNode(node);
    expect(getLifetimeSignal(node)).toBe(during);
    const alreadyClosed = createOwnershipNode();
    disposeOwnershipNode(alreadyClosed);
    expect(getLifetimeSignal(alreadyClosed).aborted).toBe(true);
  });

  it("binds hooks to nested owners and restores the parent owner", () => {
    const owner = createOwnerContext();
    const root = createOwnershipNode();
    const child = createOwnershipNode();
    let childSignal!: AbortSignal;
    const rootSignal = runWithOwnershipNode(owner, root, () => {
      const signal = useAbortSignal();
      childSignal = runWithOwnershipNode(owner, child, useAbortSignal);
      expect(useAbortSignal()).toBe(signal);
      return signal;
    });
    disposeOwnershipNode(child);
    expect(childSignal.aborted).toBe(true);
    expect(rootSignal.aborted).toBe(false);
    disposeOwnershipNode(root);
    expect(rootSignal.aborted).toBe(true);
    expect(() => useAbortSignal()).toThrow(/active ownership/);
  });

  it("cancels a nested LifecycleScope with its parent", () => {
    const root = new LifecycleScope();
    const child = root.own(new LifecycleScope());
    const signal = child.signal;
    expect(child.signal).toBe(signal);
    root.dispose();
    expect(signal.aborted).toBe(true);
    expect(root.signal.aborted).toBe(true);
  });

  it("gives each effect execution its own signal and cancels superseded runs", () => {
    const runtime = createRuntimeHarness();
    const [read, write] = createTestProducer(0);
    const owner = createOwnerContext();
    const root = createOwnershipNode();
    const signals: AbortSignal[] = [];
    const disposeEffect = runtime.run(() =>
      runWithOwnershipNode(owner, root, () =>
        useEffect(() => {
          read();
          signals.push(useAbortSignal());
        }),
      ),
    );
    const lifetime = getLifetimeSignal(root);
    write(1);
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
    disposeEffect();
    expect(signals[1]!.aborted).toBe(true);
    expect(lifetime.aborted).toBe(false);
    disposeOwnershipNode(root);
  });
});
