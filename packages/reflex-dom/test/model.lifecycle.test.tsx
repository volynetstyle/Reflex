/** @jsxImportSource ../src */

import { describe, expect, it, vi } from "vitest";
import {
  createApp,
  defineModel,
  isModel,
  isModelActionValue,
  isModelReadableValue,
  useSignal,
} from "../src";

describe("model lifecycle in reflex-dom", () => {
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
