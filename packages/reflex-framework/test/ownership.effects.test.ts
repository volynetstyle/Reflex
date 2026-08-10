import { describe, expect, it, vi } from "vitest";
import { createRuntimeHarness, createTestProducer } from "./runtime";
import {
  createOwnerContext,
  createOwnedEffect,
  createScope,
  disposeScope,
  registerCleanup,
  runWithOwner,
  runWithScope,
} from "../src";

describe("ownership effects", () => {
  it("registers owned effects created inside reactive scopes", () => {
    const runtime = createRuntimeHarness();
    const [source, setSource] = createTestProducer("a");
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    runWithScope(owner, root, () => {
      createOwnedEffect(owner, root, () => {
        const value = source();
        log.push(`run:${value}`);

        return () => {
          log.push(`cleanup:${value}`);
        };
      });
    });

    expect(log).toEqual(["run:a"]);

    setSource("b");
    runtime.flush();

    expect(log).toEqual(["run:a", "cleanup:a", "run:b"]);

    disposeScope(root);

    expect(log).toEqual(["run:a", "cleanup:a", "run:b", "cleanup:b"]);

    setSource("c");
    runtime.flush();

    expect(log).toEqual(["run:a", "cleanup:a", "run:b", "cleanup:b"]);
  });

  it("does not start owned effects while scope disposal is in progress", () => {
    const runtime = createRuntimeHarness();
    const [source, setSource] = createTestProducer(1);
    const owner = createOwnerContext();
    const root = createScope();
    const spy = vi.fn(() => {
      source();
    });

    runWithScope(owner, root, () => {
      registerCleanup(owner, () => {
        runWithOwner(owner, root, () => {
          createOwnedEffect(owner, root, spy);
        });
      });
    });

    disposeScope(root);
    runtime.flush();

    expect(spy).not.toHaveBeenCalled();

    setSource(2);
    runtime.flush();

    expect(spy).not.toHaveBeenCalled();
  });

  it("runs owned effects in scheduler FIFO order", () => {
    const runtime = createRuntimeHarness();
    const [source, setSource] = createTestProducer(1);
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    runWithScope(owner, root, () => {
      createOwnedEffect(owner, root, () => {
        log.push(`low:${source()}`);
      });

      createOwnedEffect(owner, root, () => {
        log.push(`high:${source()}`);
      });
    });

    expect(log).toEqual(["low:1", "high:1"]);

    log.length = 0;
    setSource(2);
    runtime.flush();

    expect(log).toEqual(["low:2", "high:2"]);
  });

  it("disposes an effect when its scope closes during the initial run", () => {
    const runtime = createRuntimeHarness();
    const [source, setSource] = createTestProducer(1);
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    runWithScope(owner, root, () => {
      createOwnedEffect(owner, root, () => {
        log.push(`run:${source()}`);
        disposeScope(root);
        return () => log.push("cleanup");
      });
    });

    expect(log).toEqual(["run:1", "cleanup"]);

    setSource(2);
    runtime.flush();

    expect(log).toEqual(["run:1", "cleanup"]);
  });

  it("replaces nested effects when the outer effect reruns", () => {
    const runtime = createRuntimeHarness();
    const [show, setShow] = createTestProducer(true);
    const [count, setCount] = createTestProducer(1);
    const owner = createOwnerContext();
    const root = createScope();
    const values: number[] = [];

    runWithScope(owner, root, () => {
      createOwnedEffect(owner, root, () => {
        if (show()) {
          createOwnedEffect(owner, owner.currentNode, () => {
            values.push(count());
          });
        }
      });
    });

    expect(values).toEqual([1]);
    setCount(2);
    runtime.flush();
    expect(values).toEqual([1, 2]);

    setShow(false);
    runtime.flush();
    setCount(3);
    runtime.flush();
    expect(values).toEqual([1, 2]);

    setShow(true);
    runtime.flush();
    expect(values).toEqual([1, 2, 3]);
  });

  it("disposes nested effects before the outer cleanup", () => {
    const runtime = createRuntimeHarness();
    const [source, setSource] = createTestProducer(0);
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    let stop = () => {};
    runWithScope(owner, root, () => {
      stop = createOwnedEffect(owner, root, () => {
        source();
        log.push("outer:run");
        createOwnedEffect(owner, owner.currentNode, () => {
          log.push("inner:run");
          return () => log.push("inner:cleanup");
        });
        return () => log.push("outer:cleanup");
      });
    });

    log.length = 0;
    setSource(1);
    runtime.flush();
    expect(log).toEqual([
      "inner:cleanup",
      "outer:cleanup",
      "outer:run",
      "inner:run",
    ]);

    log.length = 0;
    stop();
    expect(log).toEqual(["inner:cleanup", "outer:cleanup"]);
  });

  it("disposes sibling effects in reverse creation order", () => {
    const owner = createOwnerContext();
    const root = createScope();
    const log: number[] = [];

    let stop = () => {};
    runWithScope(owner, root, () => {
      stop = createOwnedEffect(owner, root, () => {
        for (const id of [1, 2, 3]) {
          createOwnedEffect(owner, owner.currentNode, () => () => log.push(id));
        }
      });
    });

    stop();
    expect(log).toEqual([3, 2, 1]);
  });

  it("disposes nested effects created by a failed run", () => {
    const owner = createOwnerContext();
    const root = createScope();
    const cleanup = vi.fn();

    expect(() => {
      runWithScope(owner, root, () => {
        createOwnedEffect(owner, root, () => {
          createOwnedEffect(owner, owner.currentNode, () => cleanup);
          throw new Error("failed parent");
        });
      });
    }).toThrow("failed parent");

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("attaches every nested run below the current execution scope", () => {
    const owner = createOwnerContext();
    const root = createScope();
    let outerExecution = root;
    let innerExecution = root;

    runWithScope(owner, root, () => {
      createOwnedEffect(owner, root, () => {
        outerExecution = owner.currentNode!;
        createOwnedEffect(owner, owner.currentNode, () => {
          innerExecution = owner.currentNode!;
        });
      });
    });

    expect(outerExecution.parent).toBe(root);
    expect(innerExecution.parent).toBe(outerExecution);
  });

  it("reruns an inner effect without rerunning its parent", () => {
    const [outerSource, setOuterSource] = createTestProducer(0);
    const [innerSource, setInnerSource] = createTestProducer(0);
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];

    runWithScope(owner, root, () => {
      createOwnedEffect(owner, root, () => {
        log.push(`outer:run:${outerSource()}`);
        createOwnedEffect(owner, owner.currentNode, () => {
          const value = innerSource();
          log.push(`inner:run:${value}`);
          return () => log.push(`inner:cleanup:${value}`);
        });
        return () => log.push("outer:cleanup");
      });
    });

    log.length = 0;
    setInnerSource(1);
    expect(log).toEqual(["inner:cleanup:0", "inner:run:1"]);

    log.length = 0;
    setOuterSource(1);
    expect(log).toEqual([
      "inner:cleanup:1",
      "outer:cleanup",
      "outer:run:1",
      "inner:run:1",
    ]);
  });

  it("cleans a three-level effect tree from deepest to outermost", () => {
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];
    let stop = () => {};

    runWithScope(owner, root, () => {
      stop = createOwnedEffect(owner, root, () => {
        createOwnedEffect(owner, owner.currentNode, () => {
          createOwnedEffect(owner, owner.currentNode, () => {
            return () => log.push("grandchild");
          });
          return () => log.push("child");
        });
        return () => log.push("outer");
      });
    });

    stop();
    expect(log).toEqual(["grandchild", "child", "outer"]);
  });

  it("does not accumulate children across repeated branch switches", () => {
    const [show, setShow] = createTestProducer(true);
    const [value, setValue] = createTestProducer(0);
    const owner = createOwnerContext();
    const root = createScope();
    const runs: number[] = [];
    const cleanups: number[] = [];

    runWithScope(owner, root, () => {
      createOwnedEffect(owner, root, () => {
        if (show()) {
          createOwnedEffect(owner, owner.currentNode, () => {
            const current = value();
            runs.push(current);
            return () => cleanups.push(current);
          });
        }
      });
    });

    setShow(false);
    setShow(true);
    setShow(false);
    setShow(true);
    setValue(1);

    expect(runs).toEqual([0, 0, 0, 1]);
    expect(cleanups).toEqual([0, 0, 0]);
  });

  it("keeps manual child disposal idempotent across parent lifecycle", () => {
    const [source, setSource] = createTestProducer(0);
    const owner = createOwnerContext();
    const root = createScope();
    const childCleanup = vi.fn();
    let stopOuter = () => {};
    let stopChild = () => {};

    runWithScope(owner, root, () => {
      stopOuter = createOwnedEffect(owner, root, () => {
        source();
        stopChild = createOwnedEffect(
          owner,
          owner.currentNode,
          () => childCleanup,
        );
      });
    });

    stopChild();
    stopChild();
    expect(childCleanup).toHaveBeenCalledOnce();

    setSource(1);
    expect(childCleanup).toHaveBeenCalledOnce();

    stopOuter();
    expect(childCleanup).toHaveBeenCalledTimes(2);
  });

  it("cleans the failed execution tree and recovers on a later rerun", () => {
    const [source, setSource] = createTestProducer(0);
    const owner = createOwnerContext();
    const root = createScope();
    const log: string[] = [];
    const runs: number[] = [];

    runWithScope(owner, root, () => {
      createOwnedEffect(owner, root, () => {
        const current = source();
        runs.push(current);
        createOwnedEffect(owner, owner.currentNode, () => {
          return () => log.push(`inner:cleanup:${current}`);
        });
        if (current === 1) throw new Error("failed rerun");
        return () => log.push(`outer:cleanup:${current}`);
      });
    });

    expect(() => setSource(1)).toThrow("failed rerun");
    expect(log).toEqual([
      "inner:cleanup:0",
      "outer:cleanup:0",
      "inner:cleanup:1",
    ]);

    log.length = 0;
    setSource(2);
    expect(log).toEqual([]);
    expect(runs).toEqual([0, 1, 2]);
  });

  it("cleans earlier siblings when a later nested effect throws", () => {
    const owner = createOwnerContext();
    const root = createScope();
    const firstCleanup = vi.fn();

    expect(() => {
      runWithScope(owner, root, () => {
        createOwnedEffect(owner, root, () => {
          createOwnedEffect(owner, owner.currentNode, () => firstCleanup);
          createOwnedEffect(owner, owner.currentNode, () => {
            throw new Error("failed child");
          });
        });
      });
    }).toThrow("failed child");

    expect(firstCleanup).toHaveBeenCalledOnce();
  });

});
