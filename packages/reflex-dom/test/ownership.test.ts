import { describe, expect, it, vi } from "vitest";
import {
  createOwnerContext,
  createScope,
  disposeScope,
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
});
