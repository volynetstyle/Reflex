import { describe, expect, it, vi } from "vitest";
import {
  assertSynchronous,
  LifecycleHandle,
  LifecycleScope,
  registerLifecycle,
} from "../src/ownership";

describe("LifecycleScope development diagnostics", () => {
  it("rejects closed scopes and children", () => {
    const parent = new LifecycleScope();
    const child = new LifecycleScope();
    child.dispose();
    expect(() => parent.own(child)).toThrow("child lifecycle is closed");

    parent.dispose();
    expect(() => parent.defer(() => {})).toThrow("lifecycle scope is closed");
    expect(() => parent.use({ [Symbol.dispose]() {} })).toThrow(
      "lifecycle scope is closed",
    );
    expect(() => parent.own(new LifecycleScope())).toThrow(
      "lifecycle scope is closed",
    );
  });

  it("rejects foreign ownership and cycles", () => {
    const root = new LifecycleScope();
    const branch = new LifecycleScope();
    const other = new LifecycleScope();
    root.own(branch);
    expect(() => other.own(branch)).toThrow("already has an owner");
    expect(() => branch.own(root)).toThrow("Cyclic lifecycle ownership");
    root.dispose();
    other.dispose();
  });

  it("detects Promise-like cleanup results without interrupting sibling cleanup", () => {
    const root = new LifecycleScope();
    const after = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      root.defer(() => {
        after();
      });
      root.defer(() => ({ then: () => {} }));
      root.dispose();
      expect(after).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(
        "Ownership cleanup error:",
        expect.any(TypeError),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("validates resource protocol at handle creation", () => {
    expect(() => new LifecycleHandle({} as never)).toThrow(
      "Missing Symbol.dispose",
    );
    expect(() => assertSynchronous(Promise.resolve())).toThrow(
      "synchronous callback returned a Promise-like value",
    );
  });

  it("does not adopt a resource whose disposal getter throws", () => {
    const scope = new LifecycleScope();
    const failure = new Error("getter failed");
    const resource = Object.defineProperty({}, Symbol.dispose, {
      get() {
        throw failure;
      },
    });

    expect(() => scope.handle(resource as never)).toThrow(failure);
    expect(() => scope.use(resource as never)).toThrow(failure);
    expect(scope.node.firstChild).toBeNull();
    scope.defer(() => {});
    scope.dispose();
  });

  it("reports a Promise-like resource disposer and continues other cleanup", () => {
    const scope = new LifecycleScope();
    const sibling = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      scope.defer(() => {
        sibling();
      });
      scope.own(
        scope.handle({
          [Symbol.dispose]() {
            return Promise.resolve();
          },
        }),
      );
      scope.dispose();
      expect(sibling).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(
        "Ownership cleanup error:",
        expect.any(TypeError),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("rejects a binding already owned through its underlying scope", () => {
    const first = new LifecycleScope();
    const second = new LifecycleScope();
    const child = new LifecycleScope();
    first.own(child);
    const binding = registerLifecycle({ [Symbol.dispose]() {} }, child);

    expect(() => second.own(binding)).toThrow("already has an owner");
    expect(binding.node.parent).toBe(first.node);
    first.dispose();
    second.dispose();
  });
});
