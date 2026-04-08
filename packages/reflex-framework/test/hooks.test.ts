import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "@volynets/reflex";
import {
  createOwnerContext,
  createScope,
  disposeScope,
  useComponentDidMount,
  useComponentDidUnmount,
  useEffect,
  useEffectOnce,
  useSignal,
} from "../src";
import { runInOwnershipScope } from "../src/ownership/reflex";

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

  it("supports mount and unmount lifecycle helpers inside ownership scopes", () => {
    const owner = createOwnerContext();
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
