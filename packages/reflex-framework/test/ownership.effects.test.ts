import { describe, expect, it, vi } from "vitest";
import { createRuntime, signal } from "@volynets/reflex";
import {
  createOwnerContext,
  createScope,
  disposeScope,
  registerCleanup,
  runWithOwner,
  runWithScope,
  runInOwnershipScope,
  useOwnedEffect,
} from "../src";

describe("ownership effects", () => {
  it("registers owned effects created inside reactive scopes", () => {
    const rt = createRuntime();
    const [source, setSource] = signal("a");
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    runInOwnershipScope(owner, root, () => {
      useOwnedEffect({ owner }, () => {
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
          useOwnedEffect({ owner }, spy);
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

  it("runs owned effects in scheduler FIFO order", () => {
    const rt = createRuntime({ effectStrategy: "flush" });
    const [source, setSource] = signal(1);
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    runInOwnershipScope(owner, root, () => {
      useOwnedEffect({ owner }, () => {
        log.push(`low:${source()}`);
      });

      useOwnedEffect({ owner }, () => {
        log.push(`high:${source()}`);
      });
    });

    expect(log).toEqual(["low:1", "high:1"]);

    log.length = 0;
    setSource(2);
    rt.flush();

    expect(log).toEqual(["low:2", "high:2"]);
  });
});
