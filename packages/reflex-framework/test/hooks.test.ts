import { describe, expect, it, vi } from "vitest";
import { createRuntime, signal } from "@volynets/reflex";
import {
  createScope,
  createComponentRenderable,
  disposeScope,
  useMount,
 useUnmount,
  useComputed,
  useEffect,
  useEffectOnce,
  useMemo,
  useSignal,
  runWithComponentExecution,
  runComponentRenderable,
  runInOwnershipScope,
  getHookOwner,
} from "../src";

describe("framework hooks", () => {
  it("owns component execution and consumes its result inside the component node", () => {
    createRuntime();
    const owner = getHookOwner();
    const root = createScope();
    const log: string[] = [];
    let componentNode = root;

    const renderable = createComponentRenderable(
      () => {
        componentNode = owner.currentNode!;
        useEffect(() => () => log.push("cleanup"));
        return "view";
      },
      {},
    );

    const result = runInOwnershipScope(owner, root, () =>
      runComponentRenderable(renderable, { owner }, (value) => {
        expect(owner.currentNode).toBe(componentNode);
        return value;
      }),
    );

    expect(result).toBe("view");
    expect(componentNode.parent).toBe(root);

    disposeScope(root);
    expect(log).toEqual(["cleanup"]);
  });

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

  it("supports mount and unmount lifecycle helpers inside ownership scopes", () => {
    const owner = getHookOwner();
    const root = createScope();
    const log: string[] = [];

    runInOwnershipScope(owner, root, () => {
      useMount(() => {
        log.push("mount");
      });

     useUnmount(() => {
        log.push("unmount");
      });
    });

    expect(log).toEqual(["mount"]);

    disposeScope(root);

    expect(log).toEqual(["mount", "unmount"]);
  });

  it("keeps disposed computed hooks from recalculating", () => {
    const owner = getHookOwner();
    const root = createScope();
    const [source, setSource] = signal(1);
    const compute = vi.fn(() => source() * 2);
    let doubled: Computed<number>;

    runInOwnershipScope(owner, root, () => {
      runWithComponentExecution({ owner, node: root }, () => {
        doubled = useComputed(compute);
      });
    });

    expect(doubled!()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(1);

    disposeScope(root);
    setSource(2);

    expect(doubled!()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("keeps disposed memo hooks on their last materialized value", () => {
    const owner = getHookOwner();
    const root = createScope();
    const [source, setSource] = signal(1);
    const compute = vi.fn(() => source() * 3);
    let tripled: Memo<number>;

    runInOwnershipScope(owner, root, () => {
      runWithComponentExecution({ owner, node: root }, () => {
        tripled = useMemo(compute);
      });
    });

    expect(tripled!()).toBe(3);
    expect(compute).toHaveBeenCalledTimes(1);

    disposeScope(root);
    setSource(2);

    expect(tripled!()).toBe(3);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not track useMemo warm-up in the active consumer", () => {
    const rt = createRuntime();
    const owner = getHookOwner();
    const root = createScope();
    const [source, setSource] = signal(1);
    const effectSpy = vi.fn();

    runInOwnershipScope(owner, root, () => {
      useEffect(() => {
        effectSpy();

        runWithComponentExecution({ owner, node: root }, () => {
          useMemo(() => source() * 2);
        });
      });
    });

    expect(effectSpy).toHaveBeenCalledTimes(1);

    setSource(2);
    rt.flush();

    expect(effectSpy).toHaveBeenCalledTimes(1);

    disposeScope(root);
  });
});
