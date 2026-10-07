import { describe, expect, it, vi } from "vitest";
import { createRuntimeHarness, createTestProducer } from "./runtime";
import {
  createOwnedEffect,
  createOwnerContext,
  disposeOwnershipNode,
  LifecycleHandle,
  LifecycleScope,
  OwnershipNode,
  isShuttingDown,
  prependChild,
  registerLifecycle,
  runWithOwner,
} from "../src";

describe("LifecycleScope over OwnershipNode", () => {
  it("disposes nested scopes and resource handles through one ownership tree", () => {
    const events: string[] = [];
    const root = new LifecycleScope();
    const child = new LifecycleScope();
    const resource = new LifecycleHandle({
      [Symbol.dispose]() {
        events.push("resource");
      },
    });

    root.defer(() => events.push("root"));
    child.defer(() => events.push("child"));
    child.own(resource);
    root.own(child);

    expect(root.node.firstChild).toBe(child.node);
    expect(child.node.firstChild).toBe(resource.node);
    expect(resource.node.parent).toBe(child.node);

    root.dispose();
    root.dispose();

    expect(events).toEqual(["resource", "child", "root"]);
    expect(root.disposed).toBe(true);
    expect(child.disposed).toBe(true);
    expect(resource.disposed).toBe(true);
    expect(resource.node.parent).toBeNull();
  });

  it("keeps repeated adoption idempotent and does not reparent a foreign child", () => {
    const first = new LifecycleScope();
    const second = new LifecycleScope();
    const dispose = vi.fn();
    const handle = new LifecycleHandle({ [Symbol.dispose]: dispose });

    expect(first.own(handle)).toBe(handle);
    expect(first.own(handle)).toBe(handle);
    expect(second.own(handle)).toBe(handle);
    expect(handle.node.parent).toBe(first.node);

    first.dispose();
    second.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps cycle attempts out of the tree", () => {
    const parent = new LifecycleScope();
    const child = new LifecycleScope();
    parent.own(child);
    child.own(parent);
    expect(parent.node.parent).toBeNull();
    expect(child.node.parent).toBe(parent.node);
    parent.dispose();
  });

  it("binds an external handle to its existing lifecycle node", () => {
    const events: string[] = [];
    const parent = new LifecycleScope();
    const child = new LifecycleScope();
    const model = {
      [Symbol.dispose]() {
        child.dispose();
      },
    };
    child.defer(() => events.push("child"));
    const binding = registerLifecycle(model, child);

    expect(binding.value).toBe(model);
    expect(binding.node).toBe(child.node);
    parent.own(binding);
    parent.dispose();

    expect(events).toEqual(["child"]);
    expect(binding.disposed).toBe(true);
  });

  it("uses the same node for multiple bindings of one scope", () => {
    const parent = new LifecycleScope();
    const child = new LifecycleScope();
    const dispose = vi.fn();
    child.defer(dispose);
    const first = registerLifecycle({ [Symbol.dispose]() {} }, child);
    const second = registerLifecycle({ [Symbol.dispose]() {} }, child);

    parent.own(first);
    parent.own(second);
    expect(parent.node.firstChild).toBe(child.node);
    expect(child.node.nextSibling).toBeNull();

    second.dispose();
    expect(first.disposed).toBe(true);
    expect(child.node.parent).toBeNull();
    parent.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("allows early resource disposal without disturbing siblings", () => {
    const events: string[] = [];
    const parent = new LifecycleScope();
    const early = parent.handle({
      [Symbol.dispose]() {
        events.push("early");
      },
    });
    const sibling = parent.handle({
      [Symbol.dispose]() {
        events.push("sibling");
      },
    });
    parent.own(early);
    parent.own(sibling);

    early.dispose();
    expect(early.node.parent).toBeNull();
    expect(sibling.node.parent).toBe(parent.node);
    parent.dispose();
    expect(events).toEqual(["early", "sibling"]);
  });

  it("uses a raw resource through one handle and the supplied cleanup runner", () => {
    const scope = new LifecycleScope((fn) => {
      events.push("enter");
      return fn();
    });
    const events: string[] = [];
    const resource = Object.freeze({
      [Symbol.dispose]() {
        expect(this).toBe(resource);
        events.push("dispose");
      },
    });
    expect(scope.use(resource)).toBe(resource);
    expect(scope.node.firstChild?.parent).toBe(scope.node);
    scope.dispose();
    scope.dispose();
    expect(events).toEqual(["enter", "dispose"]);
  });

  it("accepts a frozen resource and captures its disposer only once", () => {
    const dispose = vi.fn();
    const resource = Object.freeze({ [Symbol.dispose]: dispose });
    const scope = new LifecycleScope();
    const handle = scope.handle(resource);
    scope.own(handle);
    scope.dispose();
    handle.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("captures the disposer once and preserves its receiver", () => {
    const scope = new LifecycleScope();
    const resource = {
      count: 0,
      [Symbol.dispose]() {
        this.count++;
      },
    };
    scope.own(scope.handle(resource));
    resource[Symbol.dispose] = () => {
      throw new Error("method changed after adoption");
    };

    scope.dispose();
    expect(resource.count).toBe(1);
  });

  it("uses the supplied cleanup runner and keeps the construction cause", () => {
    const calls: string[] = [];
    const cause = new Error("construction failed");
    const cleanupError = new Error("cleanup failed");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const scope = new LifecycleScope((fn) => {
      calls.push("enter");
      try {
        return fn();
      } finally {
        calls.push("leave");
      }
    });

    try {
      scope.defer(() => {
        calls.push("cleanup");
        throw cleanupError;
      });
      expect(() => scope.rollback(cause)).toThrow(cause);
      expect(calls).toEqual(["enter", "cleanup", "leave"]);
      expect(consoleError).toHaveBeenCalledWith(
        "Ownership cleanup error:",
        cleanupError,
      );
      expect(isShuttingDown(scope.node)).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("treats late adoption and cleanup as inert during shutdown", () => {
    const events: string[] = [];
    const scope = new LifecycleScope();
    const late = new LifecycleScope();
    scope.defer(() => {
      scope.defer(() => events.push("late-cleanup"));
      scope.own(late);
      events.push("closing");
    });

    scope.dispose();
    expect(events).toEqual(["closing"]);
    expect(late.node.parent).toBeNull();
    late.dispose();
  });

  it("marks the complete subtree closing before any finalizer runs", () => {
    const root = new LifecycleScope();
    const first = new LifecycleScope();
    const second = new LifecycleScope();
    const late = new LifecycleScope();
    const events: string[] = [];
    first.defer(() => events.push("first"));
    second.defer(() => {
      expect(root.disposed).toBe(true);
      expect(first.disposed).toBe(true);
      first.dispose();
      root.dispose();
      root.own(late);
      events.push("second");
    });
    root.own(first);
    root.own(second);

    root.dispose();
    expect(events).toEqual(["second", "first"]);
    expect(first.node.parent).toBeNull();
    expect(second.node.parent).toBeNull();
    expect(late.node.parent).toBeNull();
    late.dispose();
  });

  it("rolls back a partially built tree while preserving its original cause", () => {
    const root = new LifecycleScope();
    const branch = new LifecycleScope();
    const cleanup = vi.fn();
    const resourceDispose = vi.fn();
    branch.defer(cleanup);
    branch.own(branch.handle({ [Symbol.dispose]: resourceDispose }));
    root.own(branch);
    const cause = new Error("construction failed");

    expect(() => root.rollback(cause)).toThrow(cause);
    expect(branch.disposed).toBe(true);
    expect(resourceDispose).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    root.dispose();
    expect(resourceDispose).toHaveBeenCalledOnce();
  });

  it("closes a deep chain without recursive cleanup calls", () => {
    const root = new LifecycleScope();
    let parent = root;
    let cleaned = 0;
    for (let index = 0; index < 2_048; index++) {
      const child = new LifecycleScope();
      child.defer(() => {
        cleaned++;
      });
      parent.own(child);
      parent = child;
    }

    root.dispose();
    expect(cleaned).toBe(2_048);
    expect(parent.disposed).toBe(true);
  });

  it("attaches a dynamic effect to an existing component owner", () => {
    const runtime = createRuntimeHarness();
    const [source, setSource] = createTestProducer(0);
    const owner = createOwnerContext();
    const componentNode = new OwnershipNode();
    const lifecycle = new LifecycleScope();
    const observed: number[] = [];

    runWithOwner(owner, componentNode, () => {
      prependChild(componentNode, lifecycle.node);
      createOwnedEffect(owner, lifecycle.node, () => {
        observed.push(source());
      });
    });

    setSource(1);
    runtime.flush();
    expect(observed).toEqual([0, 1]);

    disposeOwnershipNode(componentNode);
    setSource(2);
    runtime.flush();
    expect(observed).toEqual([0, 1]);
    expect(lifecycle.disposed).toBe(true);
  });

  it("replaces a click-created effect instead of accumulating subscriptions", () => {
    const runtime = createRuntimeHarness();
    const [source, setSource] = createTestProducer(0);
    const owner = createOwnerContext();
    const componentNode = new OwnershipNode();
    const observed: string[] = [];
    let active: LifecycleScope | null = null;

    function activate(label: string): void {
      active?.dispose();
      const next = new LifecycleScope();
      active = next;
      runWithOwner(owner, componentNode, () => {
        prependChild(componentNode, next.node);
        createOwnedEffect(owner, next.node, () => {
          const value = source();
          observed.push(`${label}:${value}`);
          return () => observed.push(`${label}:cleanup:${value}`);
        });
      });
    }

    activate("first");
    setSource(1);
    runtime.flush();
    activate("second");
    setSource(2);
    runtime.flush();
    disposeOwnershipNode(componentNode);
    setSource(3);
    runtime.flush();

    expect(observed).toEqual([
      "first:0",
      "first:cleanup:0",
      "first:1",
      "first:cleanup:1",
      "second:1",
      "second:cleanup:1",
      "second:2",
      "second:cleanup:2",
    ]);
  });
});
