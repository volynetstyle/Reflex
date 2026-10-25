/** @jsxImportSource ../src */

import { describe, expect, it, vi } from "vitest";
import {
  createDOMRenderer,
  createApp,
  defineModel,
  isModel,
  isModelActionValue,
  isModelReadableValue,
  useSignal,
} from "../src";
import {
  createProducer,
  createWatcher,
  disposeWatcher,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime";
import { getActiveOwnerContext } from "@volynets/reflex-framework";
import { getActiveDOMContext, withDOMContext } from "../src/runtime/context";

describe("model lifecycle in reflex-dom", () => {
  it("restores tracking and renderer context after nested and throwing actions", () => {
    const left = createDOMRenderer();
    const right = createDOMRenderer();
    const cause = new Error("action failed");
    const source = left.batch(() => createProducer(0));
    const trigger = right.batch(() => createProducer(0));
    const receiver = { value: 7 };
    const model = withDOMContext(left.execution, () =>
      defineModel((ctx) => {
        const nested = ctx.action(function (
          this: typeof receiver,
          value: number,
        ) {
          expect(getActiveDOMContext()).toBe(left.execution);
          expect(getActiveOwnerContext()?.currentNode).not.toBeNull();
          readProducer(source);
          return this.value + value;
        });
        return {
          fail: ctx.action(function (this: typeof receiver, value: number) {
            expect(nested.call(this, value)).toBe(this.value + value);
            expect(getActiveDOMContext()).toBe(left.execution);
            throw cause;
          }),
        };
      })(),
    );
    let runs = 0;

    const watcher = right.batch(() =>
      createWatcher(() => {
        runs++;
        const previousOwner = getActiveOwnerContext();
        expect(() => model.fail.call(receiver, 3)).toThrow(cause);
        expect(getActiveDOMContext()).toBe(right.execution);
        expect(getActiveOwnerContext()).toBe(previousOwner);
        readProducer(trigger);
      }),
    );
    const runRight = (fn: () => void) =>
      withDOMContext(right.execution, () => right.batch(fn));
    try {
      runRight(() => runWatcher(watcher));
      expect(runs).toBe(1);
      left.batch(() => writeProducer(source, 1));
      expect(runs).toBe(1);
      runRight(() => writeProducer(trigger, 1));
      expect(runs).toBe(2);
      expect(getActiveDOMContext()).toBeNull();
      expect(getActiveOwnerContext()).toBeNull();
    } finally {
      right.batch(() => disposeWatcher(watcher));
      model.dispose();
    }
  });

  it("owns nested models and resources until their component unmounts", () => {
    const app = createApp();
    const container = document.createElement("div");
    const events: string[] = [];
    const resource = { [Symbol.dispose]: vi.fn(() => events.push("resource")) };
    let model!: ReturnType<typeof createCounter>;

    function createCounter(count: ReturnType<typeof useSignal<number>>) {
      const createChild = defineModel((ctx) => {
        ctx.onDispose(() => events.push("child"));
        return { label: ctx.read(() => "child") };
      });
      return defineModel((ctx) => {
        ctx.onDispose(() => events.push("parent"));
        const resourceHandle = ctx.handle(resource);
        ctx.own(resourceHandle);
        ctx.own(resourceHandle);
        const child = ctx.own(createChild());
        return {
          child,
          count: ctx.read(() => count()),
          increment: ctx.action(() => count((previous) => previous + 1)),
        };
      })();
    }

    function View() {
      const count = useSignal(0);
      model = createCounter(count);
      return <button onClick={() => model.increment()}>{model.count}</button>;
    }

    const unmount = app.render(<View />, container);
    expect(isModel(model)).toBe(true);
    expect(isModelReadableValue(model.count)).toBe(true);
    expect(isModelActionValue(model.increment)).toBe(true);
    expect(container.textContent).toBe("0");
    container.querySelector("button")!.click();
    expect(container.textContent).toBe("1");

    unmount();
    expect(model.disposed).toBe(true);
    expect(model.child.disposed).toBe(true);
    expect(resource[Symbol.dispose]).toHaveBeenCalledOnce();
    expect(events).toEqual(["child", "resource", "parent"]);

    model.dispose();
    expect(resource[Symbol.dispose]).toHaveBeenCalledOnce();
    expect(model.increment()).toBeUndefined();
    expect(model.count()).toBeUndefined();
  });

  it("disposes a model when only its component branch is removed", () => {
    const app = createApp();
    const container = document.createElement("div");
    const cleanup = vi.fn();
    const create = defineModel((ctx) => {
      ctx.onDispose(cleanup);
      return { label: ctx.read(() => "active") };
    });
    let setVisible!: (value: boolean) => void;
    let model!: ReturnType<typeof create>;

    function Inner() {
      model = create();
      return <span>{model.label}</span>;
    }

    function View() {
      const visible = useSignal(true);
      setVisible = (value) => app.renderer.batch(() => visible(value));
      return <main>{() => (visible() ? <Inner /> : null)}</main>;
    }

    const unmount = app.render(<View />, container);
    expect(container.textContent).toBe("active");
    setVisible(false);
    expect(container.textContent).toBe("");
    expect(model.disposed).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
    unmount();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("rolls back nested ownership when setup fails and preserves the cause", () => {
    const cause = new Error("setup failed");
    const events: string[] = [];
    const createChild = defineModel((ctx) => {
      ctx.onDispose(() => events.push("child"));
      return { value: ctx.read(() => 1) };
    });
    const createParent = defineModel((ctx) => {
      ctx.onDispose(() => events.push("parent"));
      createChild();
      throw cause;
    });

    expect(() => createParent()).toThrow(cause);
    expect(events).toEqual(["child", "parent"]);
  });

  it("cleans acquired resources when shape validation rejects a model", () => {
    const release = vi.fn();
    const create = defineModel((ctx) => {
      ctx.own({ [Symbol.dispose]: release });
      return { invalid: 1 } as never;
    });

    expect(() => create()).toThrow("Use ctx.read()");
    expect(release).toHaveBeenCalledOnce();
  });

  it("owns models created in setup and actions without explicit adoption", () => {
    const cleanup = vi.fn();
    const createChild = defineModel((ctx) => {
      ctx.onDispose(cleanup);
      return { value: ctx.read(() => 1) };
    });
    let setupChild!: ReturnType<typeof createChild>;
    let actionChild!: ReturnType<typeof createChild>;
    const createParent = defineModel((ctx) => {
      setupChild = createChild();
      return {
        spawn: ctx.action(() => {
          actionChild = createChild();
        }),
      };
    });

    const parent = createParent();
    parent.spawn();
    expect(setupChild.disposed).toBe(false);
    expect(actionChild.disposed).toBe(false);
    parent.dispose();
    expect(setupChild.disposed).toBe(true);
    expect(actionChild.disposed).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("keeps an action-created child on its component renderer", () => {
    const app = createApp();
    const container = document.createElement("div");
    let parent!: ReturnType<typeof createParent>;
    let child!: ReturnType<typeof createChild>;

    function createChild(count: ReturnType<typeof useSignal<number>>) {
      return defineModel((ctx) => ({
        increment: ctx.action(() => count((previous) => previous + 1)),
      }))();
    }

    function createParent(count: ReturnType<typeof useSignal<number>>) {
      return defineModel((ctx) => ({
        spawn: ctx.action(() => {
          child = createChild(count);
        }),
      }))();
    }

    function View() {
      const count = useSignal(0);
      parent = createParent(count);
      return <span>{count}</span>;
    }

    const unmount = app.render(<View />, container);
    parent.spawn();
    child.increment();
    expect(container.textContent).toBe("1");
    unmount();
    expect(parent.disposed).toBe(true);
    expect(child.disposed).toBe(true);
  });

  it("does not dispose a standalone model when an unrelated root closes", () => {
    const app = createApp();
    const container = document.createElement("div");
    const cleanup = vi.fn();
    const create = defineModel((ctx) => {
      ctx.onDispose(cleanup);
      return { value: ctx.read(() => 5) };
    });
    const standalone = create();

    const unmount = app.render(<span>ready</span>, container);
    unmount();
    expect(standalone.disposed).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();

    standalone[Symbol.dispose]();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
