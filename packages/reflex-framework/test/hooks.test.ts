import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "@volynets/reflex";
import {
  createScope,
  disposeScope,
  useComponentDidMount,
  useComponentDidUnmount,
  useEffect,
  useEffectOnce,
  useEffectRender,
  useSignal,
  runWithComponentHooks,
  runInOwnershipScope,
  getHookOwner,
} from "../src";

describe("framework hooks", () => {
  it("exposes signal state through useSignal and reacts through useEffect", () => {
    const rt = createRuntime();
    const [count, setCount] = useSignal(1);
    const values: number[] = [];

    const dispose = useEffect(() => {
      values.push(count());
    });

    expect(values).toEqual([1]);

    setCount(2);
    rt.flush();

    expect(values).toEqual([1, 2]);

    dispose();

    setCount(3);
    rt.flush();

    expect(values).toEqual([1, 2]);
  });

  it("runs useEffectOnce only once", () => {
    const spy = vi.fn();

    useEffectOnce(() => {
      spy();
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("schedules useEffectRender through the current host scheduler", () => {
    const rt = createRuntime();
    const owner = getHookOwner();
    const root = createScope();
    const tasks: Array<() => void> = [];
    const values: string[] = [];

    runInOwnershipScope(owner, root, () => {
      runWithComponentHooks(
        {
          owner,
          scope: root,
          renderEffectScheduler: {
            schedule(task) {
              tasks.push(task);
              return () => {};
            },
          },
        },
        () => {
          useEffectRender(() => {
            values.push("render");
          });
        },
      );
    });

    expect(values).toEqual([]);
    expect(tasks).toHaveLength(1);

    tasks[0]!();
    rt.flush();

    expect(values).toEqual(["render"]);

    disposeScope(root);
  });

  it("uses a no-op render scheduler when a host does not provide one", () => {
    const owner = getHookOwner();
    const root = createScope();
    const values: string[] = [];

    runInOwnershipScope(owner, root, () => {
      runWithComponentHooks({ owner, scope: root }, () => {
        useEffectRender(() => {
          values.push("render");
        });
      });
    });

    expect(values).toEqual([]);

    disposeScope(root);
  });

  it("supports mount and unmount lifecycle helpers inside ownership scopes", () => {
    const owner = getHookOwner();
    const root = createScope();
    const log: string[] = [];

    runInOwnershipScope(owner, root, () => {
      useComponentDidMount(() => {
        log.push("mount");
      });

      useComponentDidUnmount(() => {
        log.push("unmount");
      });
    });

    expect(log).toEqual(["mount"]);

    disposeScope(root);

    expect(log).toEqual(["mount", "unmount"]);
  });
});
