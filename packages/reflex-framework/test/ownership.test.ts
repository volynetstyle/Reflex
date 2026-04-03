import { describe, expect, it, vi } from "vitest";
import {
  addCleanup,
  appendChild,
  createOwnerContext,
  createScope,
  disposeScope,
  getChildCount,
  registerCleanup,
  runWithScope,
} from "../src/ownership";

describe("ownership lifecycle", () => {
  it("disposes nested scopes inside-out and runs cleanups in reverse registration order", () => {
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    runWithScope(owner, root, () => {
      registerCleanup(owner, () => {
        log.push("root:1");
      });
      registerCleanup(owner, () => {
        log.push("root:2");
      });

      const firstChild = createScope();
      runWithScope(owner, firstChild, () => {
        registerCleanup(owner, () => {
          log.push("first-child:1");
        });

        const grandChild = createScope();
        runWithScope(owner, grandChild, () => {
          registerCleanup(owner, () => {
            log.push("grand-child:1");
          });
          registerCleanup(owner, () => {
            log.push("grand-child:2");
          });
        });

        registerCleanup(owner, () => {
          log.push("first-child:2");
        });
      });

      const secondChild = createScope();
      runWithScope(owner, secondChild, () => {
        registerCleanup(owner, () => {
          log.push("second-child:1");
        });
      });
    });

    disposeScope(root);

    expect(log).toEqual([
      "grand-child:2",
      "grand-child:1",
      "first-child:2",
      "first-child:1",
      "second-child:1",
      "root:2",
      "root:1",
    ]);
  });

  it("continues disposal after cleanup errors and logs each failure", () => {
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];
    const firstError = new Error("cleanup one failed");
    const secondError = new Error("cleanup two failed");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      runWithScope(owner, root, () => {
        registerCleanup(owner, () => {
          log.push("root:ok");
        });

        const child = createScope();
        runWithScope(owner, child, () => {
          registerCleanup(owner, () => {
            log.push("child:ok");
          });
          registerCleanup(owner, () => {
            log.push("child:error:1");
            throw firstError;
          });
          registerCleanup(owner, () => {
            log.push("child:error:2");
            throw secondError;
          });
        });
      });

      expect(() => {
        disposeScope(root);
      }).not.toThrow();

      expect(log).toEqual([
        "child:error:2",
        "child:error:1",
        "child:ok",
        "root:ok",
      ]);
      expect(consoleError).toHaveBeenCalledTimes(2);
      expect(consoleError).toHaveBeenNthCalledWith(
        1,
        "Ownership cleanup error:",
        secondError,
      );
      expect(consoleError).toHaveBeenNthCalledWith(
        2,
        "Ownership cleanup error:",
        firstError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("detaches a disposed subtree from a live root and clears sibling links", () => {
    const owner = createOwnerContext();
    const root = createScope();
    let left: ReturnType<typeof createScope>;
    let branch: ReturnType<typeof createScope>;
    let right: ReturnType<typeof createScope>;
    let grandChild: ReturnType<typeof createScope>;

    runWithScope(owner, root, () => {
      left = createScope();
      runWithScope(owner, left, () => {});

      branch = createScope();
      runWithScope(owner, branch, () => {
        grandChild = createScope();
        runWithScope(owner, grandChild, () => {});
      });

      right = createScope();
      runWithScope(owner, right, () => {});
    });

    disposeScope(branch!);

    expect(root.firstChild).toBe(left!);
    expect(root.lastChild).toBe(right!);
    expect(left!.nextSibling).toBe(right!);
    expect(right!.prevSibling).toBe(left!);
    expect(getChildCount(root)).toBe(2);

    expect(branch!.parent).toBeNull();
    expect(branch!.prevSibling).toBeNull();
    expect(branch!.nextSibling).toBeNull();
    expect(branch!.firstChild).toBeNull();
    expect(branch!.lastChild).toBeNull();

    expect(grandChild!.parent).toBeNull();
    expect(grandChild!.prevSibling).toBeNull();
    expect(grandChild!.nextSibling).toBeNull();
  });

  it("keeps the live root consistent when subtree cleanup throws", () => {
    const owner = createOwnerContext();
    const root = createScope();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const cleanupError = new Error("branch cleanup failed");
    let left: ReturnType<typeof createScope>;
    let branch: ReturnType<typeof createScope>;
    let right: ReturnType<typeof createScope>;

    try {
      runWithScope(owner, root, () => {
        left = createScope();
        runWithScope(owner, left, () => {});

        branch = createScope();
        runWithScope(owner, branch, () => {
          registerCleanup(owner, () => {
            throw cleanupError;
          });
        });

        right = createScope();
        runWithScope(owner, right, () => {});
      });

      expect(() => disposeScope(branch!)).not.toThrow();

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        "Ownership cleanup error:",
        cleanupError,
      );

      expect(root.firstChild).toBe(left!);
      expect(root.lastChild).toBe(right!);
      expect(left!.nextSibling).toBe(right!);
      expect(right!.prevSibling).toBe(left!);
      expect(getChildCount(root)).toBe(2);

      expect(branch!.parent).toBeNull();
      expect(branch!.prevSibling).toBeNull();
      expect(branch!.nextSibling).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("marks scopes shutting down before cleanup so late registrations are ignored", () => {
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];
    let branch!: ReturnType<typeof createScope>;
    let lateChild!: ReturnType<typeof createScope>;

    runWithScope(owner, root, () => {
      branch = createScope();
      runWithScope(owner, branch, () => {
        registerCleanup(owner, () => {
          log.push("branch");
          addCleanup(branch, () => {
            log.push("late-cleanup");
          });

          lateChild = createScope();
          appendChild(branch, lateChild);
        });
      });
    });

    disposeScope(root);
    disposeScope(root);

    expect(log).toEqual(["branch"]);
    expect(lateChild.parent).toBeNull();
    expect(lateChild.prevSibling).toBeNull();
    expect(lateChild.nextSibling).toBeNull();
  });

  it("keeps scope disposal reentrancy-safe when cleanup disposes the same scope", () => {
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    runWithScope(owner, root, () => {
      registerCleanup(owner, () => {
        log.push("cleanup");
        expect(() => disposeScope(root)).not.toThrow();
      });
    });

    expect(() => disposeScope(root)).not.toThrow();
    expect(log).toEqual(["cleanup"]);
  });
});
