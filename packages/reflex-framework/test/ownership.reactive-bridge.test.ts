import { describe, expect, it, vi } from "vitest";
import { createRuntime, effect, signal } from "@volynets/reflex";
import {
  createOwnerContext,
  createScope,
  disposeScope,
  registerCleanup,
  runWithOwner,
  runWithScope,
  type Cleanup,
} from "../src";
import { createOwnershipReactiveBridge } from "../src/ownership/bridge";
import { useEffect, runInOwnershipScope } from "../src/ownership/reflex";

describe("ownership reactive bridge", () => {
  it("registers plain Reflex effects created inside reactive scopes", () => {
    const rt = createRuntime();
    const [source, setSource] = signal("a");
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    runInOwnershipScope(owner, root, () => {
      effect(() => {
        const value = source();
        log.push(`run:${value}`);

        return () => {
          log.push(`cleanup:${value}`);
        };
      });
    });

    expect(log).toEqual(["run:a"]);

    setSource("b");
    rt.flush();

    expect(log).toEqual(["run:a", "cleanup:a", "run:b"]);

    disposeScope(root);

    expect(log).toEqual(["run:a", "cleanup:a", "run:b", "cleanup:b"]);

    setSource("c");
    rt.flush();

    expect(log).toEqual(["run:a", "cleanup:a", "run:b", "cleanup:b"]);
  });

  it("does not start owned effects while scope disposal is in progress", () => {
    const rt = createRuntime();
    const [source, setSource] = signal(1);
    const owner = createOwnerContext();
    const root = createScope();
    const spy = vi.fn(() => {
      source();
    });

    runWithScope(owner, root, () => {
      registerCleanup(owner, () => {
        runWithOwner(owner, root, () => {
          useEffect(owner, spy);
        });
      });
    });

    disposeScope(root);
    rt.flush();

    expect(spy).not.toHaveBeenCalled();

    setSource(2);
    rt.flush();

    expect(spy).not.toHaveBeenCalled();
  });

  it("adapts ownership to custom reactive engines through a thin adapter", () => {
    let currentRegistrar: ((cleanup: Cleanup) => void) | null = null;

    const bridge = createOwnershipReactiveBridge({
      effect(fn) {
        const cleanup = (fn() ?? (() => {})) as Cleanup;
        currentRegistrar?.(cleanup);
        return cleanup;
      },
      withCleanupRegistrar<T>(registrar: ((cleanup: Cleanup) => void) | null, fn: () => T): T {
        const previousRegistrar = currentRegistrar;
        currentRegistrar = registrar;

        try {
          return fn();
        } finally {
          currentRegistrar = previousRegistrar;
        }
      },
    });

    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    bridge.runInOwnershipScope(owner, root, () => {
      if (currentRegistrar === null) {
        throw new Error("reactive scope should expose cleanup registrar");
      }

      bridge.useEffect(owner, () => {
        log.push("owned:run");

        return () => {
          log.push("owned:cleanup");
        };
      });

      currentRegistrar(() => {
        log.push("plain:cleanup");
      });
    });

    expect(log).toEqual(["owned:run"]);

    disposeScope(root);

    expect(log).toEqual(["owned:run", "plain:cleanup", "owned:cleanup"]);
  });
});
