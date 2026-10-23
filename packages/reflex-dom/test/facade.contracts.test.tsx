/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import type { EffectStrategy } from "@volynets/reflex-scheduler";
import {
  BorrowError,
  createApp,
  createContext,
  createPort,
  For,
  onCleanup,
  Portal,
  Provider,
  provideContext,
  ReleasedResourceError,
  renderToString,
  Show,
  useCallbackContext,
  useContext,
  useEffect,
  useLease,
  useOwnedComputed,
  useOwnedSignal,
  usePortEndpoint,
  useSignal,
  useTransfer,
  type OwnedSignal,
  type PortEndpoint,
  type SignalAccessor,
} from "../src";

const strategies: EffectStrategy[] = ["eager", "sab", "flush"];

function setup(effectStrategy: EffectStrategy) {
  const app = createApp({ effectStrategy });
  const container = document.createElement("div");
  const settle = (fn?: () => void) => {
    if (fn !== undefined) app.renderer.batch(fn);
    app.renderer.flush();
  };
  return { app, container, settle };
}

describe("context outside components", () => {
  it("returns the default value, or undefined without one", () => {
    expect(useContext(createContext("fallback"))).toBe("fallback");
    expect(useContext(createContext<string>())).toBeUndefined();
  });

  it("ignores provideContext without an owner", () => {
    const Theme = createContext("default");
    expect(() => provideContext(Theme, "dark")).not.toThrow();
    expect(useContext(Theme)).toBe("default");
  });
});

describe.each(strategies)("facade contracts (%s)", (effectStrategy) => {
  describe("context", () => {
    it("nearest Provider wins and siblings keep the outer value", () => {
      const { app, container } = setup(effectStrategy);
      const Theme = createContext("root");

      function Label() {
        return <i>{useContext(Theme)}</i>;
      }

      app.render(
        <Provider context={Theme} value="outer">
          <Label />
          <Provider context={Theme} value="inner">
            <Label />
          </Provider>
          <Label />
        </Provider>,
        container,
      );
      expect(container.textContent).toBe("outerinnerouter");
      app.dispose();
    });

    it("provideContext affects descendants, not the providing component", () => {
      const { app, container } = setup(effectStrategy);
      const Theme = createContext("root");

      function Child() {
        return <b>{useContext(Theme)}</b>;
      }

      function Parent() {
        const before = useContext(Theme);
        provideContext(Theme, "parent");
        return (
          <p>
            {before}:<Child />
          </p>
        );
      }

      app.render(
        <div>
          <Parent />
          <Child />
        </div>,
        container,
      );
      expect(container.textContent).toBe("root:parentroot");
      app.dispose();
    });

    it("a provided signal delivers changes; the value itself is read once", () => {
      const { app, container, settle } = setup(effectStrategy);
      const Theme = createContext<() => string>(() => "none");
      let theme!: SignalAccessor<string>;

      function Label() {
        const read = useContext(Theme);
        return <i>{() => read()}</i>;
      }

      function View() {
        theme = useSignal("light");
        return (
          <Provider context={Theme} value={theme}>
            <Label />
          </Provider>
        );
      }

      app.render(<View />, container);
      settle(() => theme("dark"));
      expect(container.textContent).toBe("dark");
      app.dispose();
    });

    it("Portal content keeps the context of its source component", () => {
      const { app, container } = setup(effectStrategy);
      const target = document.createElement("aside");
      const Theme = createContext("root");

      function Label() {
        return <i>{useContext(Theme)}</i>;
      }

      app.render(
        <Provider context={Theme} value="source">
          <Portal to={target}>
            <Label />
          </Portal>
        </Provider>,
        container,
      );
      expect(target.textContent).toBe("source");
      app.dispose();
      expect(target.textContent).toBe("");
    });
  });

  describe("useCallbackContext", () => {
    it("passes arguments and returns the result", () => {
      const { app, container } = setup(effectStrategy);
      let add!: (a: number, b: number) => number | undefined;

      function View() {
        add = useCallbackContext((a: number, b: number) => a + b);
        return null;
      }

      app.render(<View />, container);
      expect(add(2, 3)).toBe(5);
      app.dispose();
    });

    it("rethrows errors and leaves the renderer usable", () => {
      const { app, container, settle } = setup(effectStrategy);
      let fail!: () => void;
      let count!: SignalAccessor<number>;

      function View() {
        count = useSignal(0);
        fail = useCallbackContext(() => {
          throw new Error("boom");
        });
        return <span>{count}</span>;
      }

      app.render(<View />, container);
      expect(() => fail()).toThrow("boom");
      settle(() => count(1));
      expect(container.textContent).toBe("1");
      app.dispose();
    });

    it("groups the writes of one call into one batch", () => {
      const { app, container, settle } = setup(effectStrategy);
      const runs: string[] = [];
      let update!: () => void;

      function View() {
        const first = useSignal("a");
        const second = useSignal("a");
        useEffect(() => {
          runs.push(`${first()}${second()}`);
        });
        update = useCallbackContext(() => {
          first("b");
          second("b");
        });
        return null;
      }

      app.render(<View />, container);
      settle();
      update();
      settle();
      expect(runs).toEqual(["aa", "bb"]);
      app.dispose();
    });

    it("binds a For row callback to the row", () => {
      const { app, container, settle } = setup(effectStrategy);
      const log: string[] = [];
      const bound = new Map<string, () => void>();
      let items!: SignalAccessor<string[]>;

      function View() {
        items = useSignal(["a", "b"]);
        return (
          <ul>
            <For each={items} by={(item) => item}>
              {(item) => {
                const id = item();
                bound.set(
                  id,
                  useCallbackContext(() => onCleanup(() => log.push(id))),
                );
                return <li>{id}</li>;
              }}
            </For>
          </ul>
        );
      }

      app.render(<View />, container);
      bound.get("a")!();
      bound.get("b")!();
      settle(() => items(["b"]));
      expect(log).toEqual(["a"]);
      expect(bound.get("a")!()).toBeUndefined();
      app.dispose();
      expect(log).toEqual(["a", "b"]);
    });

    it("calls the function directly outside a DOM application", () => {
      const double = useCallbackContext((value: number) => value * 2);
      expect(double(4)).toBe(8);
    });
  });

  describe("event handlers", () => {
    it("a handler in a For row releases its resources with the row", () => {
      const { app, container, settle } = setup(effectStrategy);
      const log: string[] = [];
      let items!: SignalAccessor<string[]>;

      function View() {
        items = useSignal(["a", "b"]);
        return (
          <div>
            <For each={items} by={(item) => item}>
              {(item) => (
                <button onClick={() => onCleanup(() => log.push(item()))} />
              )}
            </For>
          </div>
        );
      }

      app.render(<View />, container);
      for (const button of container.querySelectorAll("button")) button.click();
      settle(() => items(["b"]));
      expect(log).toEqual(["a"]);
      app.dispose();
      expect(log).toEqual(["a", "b"]);
    });

    it("a listener object with an aborted signal never attaches", () => {
      const { app, container } = setup(effectStrategy);
      const controller = new AbortController();
      controller.abort();
      let calls = 0;

      app.render(
        <button
          onClick={{ handleEvent: () => calls++, signal: controller.signal }}
        />,
        container,
      );
      container.querySelector("button")!.click();
      expect(calls).toBe(0);
      app.dispose();
    });
  });

  describe("owned values", () => {
    it("throws outside an owner", () => {
      expect(() => useOwnedSignal(1)).toThrow(
        "useOwnedSignal() needs an active owner.",
      );
      expect(() => useOwnedComputed(() => 1)).toThrow(
        "useOwnedComputed() needs an active owner.",
      );
    });

    it("writes deliver like useSignal writes", () => {
      const { app, container, settle } = setup(effectStrategy);
      let value!: OwnedSignal<number>;
      let doubled!: () => number;

      function View() {
        value = useOwnedSignal(1);
        doubled = useOwnedComputed(() => value() * 2);
        return <span>{() => `${value()}:${doubled()}`}</span>;
      }

      app.render(<View />, container);
      value.set((previous) => previous + 1);
      settle();
      expect(container.textContent).toBe("2:4");
      app.dispose();
    });

    it("throws after release instead of reading a dead value", () => {
      const { app, container } = setup(effectStrategy);
      let value!: OwnedSignal<number>;

      function View() {
        value = useOwnedSignal(1);
        return null;
      }

      const dispose = app.render(<View />, container);
      dispose();
      expect(() => value()).toThrow(ReleasedResourceError);
      expect(() => value.set(2)).toThrow(ReleasedResourceError);
      app.dispose();
    });

    it("a lease ends early when its function is called", () => {
      const { app, container, settle } = setup(effectStrategy);
      let value!: OwnedSignal<number>;
      let end!: () => void;
      let showOwner!: SignalAccessor<boolean>;

      function Owner() {
        value = useOwnedSignal(1);
        return null;
      }

      function Borrower() {
        end = useLease(value);
        return null;
      }

      function View() {
        showOwner = useSignal(true);
        return (
          <div>
            <Show when={showOwner}>
              <Owner />
            </Show>
            <Borrower />
          </div>
        );
      }

      app.render(<View />, container);
      settle(() => showOwner(false));
      expect(value()).toBe(1);
      end();
      expect(() => value()).toThrow(ReleasedResourceError);
      app.dispose();
    });

    it("cannot be transferred into another application", () => {
      const one = setup(effectStrategy);
      const two = setup(effectStrategy);
      let value!: OwnedSignal<number>;

      function Owner() {
        value = useOwnedSignal(1);
        return null;
      }

      function Adopter() {
        useTransfer(value);
        return null;
      }

      one.app.render(<Owner />, one.container);
      expect(() => two.app.render(<Adopter />, two.container)).toThrow(
        BorrowError,
      );
      one.app.dispose();
      two.app.dispose();
    });
  });

  describe("ports", () => {
    it("rejects an endpoint outside an application and a same-app port", () => {
      const { app, container } = setup(effectStrategy);
      let first!: PortEndpoint;
      let second!: PortEndpoint;

      expect(() => usePortEndpoint()).toThrow(
        "usePortEndpoint() needs an active DOM application.",
      );

      function A() {
        first = usePortEndpoint();
        return null;
      }

      function B() {
        second = usePortEndpoint();
        return null;
      }

      app.render(
        <>
          <A />
          <B />
        </>,
        container,
      );
      expect(() => createPort(first, second)).toThrow(TypeError);
      app.dispose();
    });

    it("closes when the source component is disposed", () => {
      const source = setup(effectStrategy);
      const target = setup(effectStrategy);
      let from!: PortEndpoint;
      let to!: PortEndpoint;

      function Publisher() {
        from = usePortEndpoint();
        return null;
      }

      function Reader() {
        to = usePortEndpoint();
        return null;
      }

      const disposeSource = source.app.render(<Publisher />, source.container);
      target.app.render(<Reader />, target.container);
      const port = createPort<number>(from, to);
      disposeSource();
      expect(port.closed).toBe(true);
      source.app.dispose();
      target.app.dispose();
    });
  });

  describe("application disposal", () => {
    it("is idempotent and turns old root disposers into no-ops", () => {
      const { app, container } = setup(effectStrategy);
      const dispose = app.render(<span>x</span>, container);
      app.dispose();
      expect(() => app.dispose()).not.toThrow();
      expect(() => dispose()).not.toThrow();
      expect(container.textContent).toBe("");
    });

    it("rejects new roots and runtime entry, but flush is a no-op", () => {
      const { app, container } = setup(effectStrategy);
      app.dispose();
      expect(() => app.hydrate(<span />, container)).toThrow(
        "The DOM renderer is disposed.",
      );
      expect(() => app.resume(container)).toThrow(
        "The DOM renderer is disposed.",
      );
      expect(() => app.renderer.run(() => 1)).toThrow(
        "The execution domain is closed.",
      );
      expect(() => app.renderer.batch(() => 1)).toThrow(
        "The execution domain is closed.",
      );
      expect(() => app.renderer.flush()).not.toThrow();
    });

    it("can be requested from the application's own event handler", () => {
      const { app, container } = setup(effectStrategy);
      const log: string[] = [];

      function View() {
        onCleanup(() => log.push("view"));
        return <button onClick={() => app.dispose()} />;
      }

      app.render(<View />, container);
      container.querySelector("button")!.click();
      expect(app.disposed).toBe(true);
      expect(log).toEqual(["view"]);
      expect(container.textContent).toBe("");
    });

    it("turns bound callbacks into no-ops", () => {
      const { app, container } = setup(effectStrategy);
      let calls = 0;
      let callback!: () => void;

      function View() {
        callback = useCallbackContext(() => {
          calls++;
        });
        return null;
      }

      app.render(<View />, container);
      app.dispose();
      expect(callback()).toBeUndefined();
      expect(calls).toBe(0);
    });
  });

  describe("keyed For", () => {
    it("moves multi-node rows as a unit", () => {
      const { app, container, settle } = setup(effectStrategy);
      let items!: SignalAccessor<string[]>;

      function View() {
        items = useSignal(["a", "b"]);
        return (
          <div>
            <For each={items} by={(item) => item}>
              {(item) => (
                <>
                  <i>{item()}</i>
                  <b>{item()}</b>
                </>
              )}
            </For>
          </div>
        );
      }

      app.render(<View />, container);
      const nodes = Array.from(container.querySelectorAll("i, b"));
      settle(() => items(["b", "a"]));
      expect(container.textContent).toBe("bbaa");
      expect(Array.from(container.querySelectorAll("i, b"))).toEqual([
        nodes[2],
        nodes[3],
        nodes[0],
        nodes[1],
      ]);
      app.dispose();
    });

    it("keeps the fallback mounted across repeated empty updates", () => {
      const { app, container, settle } = setup(effectStrategy);
      const log: string[] = [];
      let items!: SignalAccessor<string[]>;

      function Empty() {
        log.push("mount");
        onCleanup(() => log.push("cleanup"));
        return <em>empty</em>;
      }

      function View() {
        items = useSignal<string[]>([]);
        return (
          <div>
            <For each={items} by={(item) => item} fallback={<Empty />}>
              {(item) => <i>{item()}</i>}
            </For>
          </div>
        );
      }

      app.render(<View />, container);
      const fallback = container.querySelector("em");
      settle(() => items([]));
      expect(container.querySelector("em")).toBe(fallback);
      settle(() => items(["a"]));
      expect(container.textContent).toBe("a");
      settle(() => items([]));
      expect(container.textContent).toBe("empty");
      expect(log).toEqual(["mount", "cleanup", "mount"]);
      app.dispose();
    });

    it("passes raw items to by and accessors to children", () => {
      const { app, container } = setup(effectStrategy);
      const seen: unknown[] = [];

      app.render(
        <ul>
          <For
            each={[{ id: "a" }]}
            by={(item, index) => {
              seen.push(item, index);
              return item.id;
            }}
          >
            {(item, index) => {
              seen.push(typeof item, typeof index);
              return <li />;
            }}
          </For>
        </ul>,
        container,
      );
      expect(seen).toEqual([{ id: "a" }, 0, "function", "function"]);
      app.dispose();
    });

    it("nested lists keep inner rows when the outer row moves", () => {
      const { app, container, settle } = setup(effectStrategy);
      let groups!: SignalAccessor<{ id: string; items: string[] }[]>;

      function View() {
        groups = useSignal([
          { id: "x", items: ["x1", "x2"] },
          { id: "y", items: ["y1"] },
        ]);
        return (
          <div>
            <For each={groups} by={(group) => group.id}>
              {(group) => (
                <section>
                  <For each={() => group().items} by={(item) => item}>
                    {(item) => <i>{item()}</i>}
                  </For>
                </section>
              )}
            </For>
          </div>
        );
      }

      app.render(<View />, container);
      const x2 = container.querySelectorAll("i")[1];
      settle(() =>
        groups([
          { id: "y", items: ["y1"] },
          { id: "x", items: ["x2", "x1"] },
        ]),
      );
      expect(container.textContent).toBe("y1x2x1");
      expect(container.querySelectorAll("i")[1]).toBe(x2);
      app.dispose();
    });
  });

  describe("hydration", () => {
    function hydrate(
      app: ReturnType<typeof createApp>,
      container: HTMLElement,
      view: () => Parameters<typeof renderToString>[0],
    ) {
      container.innerHTML = renderToString(view());
      return app.hydrate(view(), container);
    }

    it("a text slot keeps its server text node and updates it in place", () => {
      const { app, container, settle } = setup(effectStrategy);
      let label!: SignalAccessor<string>;

      function View() {
        label = useSignal("a");
        return <p>{() => label()}</p>;
      }

      hydrate(app, container, () => <View />);
      const text = container.querySelector("p")!.childNodes[1];
      settle(() => label("b"));
      expect(container.querySelector("p")!.childNodes[1]).toBe(text);
      expect(container.textContent).toBe("b");
      app.dispose();
    });

    it("an empty text slot hydrates and later shows text", () => {
      const { app, container, settle } = setup(effectStrategy);
      let label!: SignalAccessor<string>;

      function View() {
        label = useSignal("");
        return <p>{() => label()}</p>;
      }

      hydrate(app, container, () => <View />);
      const paragraph = container.querySelector("p");
      settle(() => label("now"));
      expect(container.querySelector("p")).toBe(paragraph);
      expect(container.textContent).toBe("now");
      app.dispose();
    });

    it("an empty slot hydrates and later mounts content", () => {
      const { app, container, settle } = setup(effectStrategy);
      let on!: SignalAccessor<boolean>;

      function View() {
        on = useSignal(false);
        return <p>{() => (on() ? <b>on</b> : null)}</p>;
      }

      hydrate(app, container, () => <View />);
      settle(() => on(true));
      expect(container.textContent).toBe("on");
      app.dispose();
    });

    it("a For inside Show adopts rows and their handlers", () => {
      const { app, container } = setup(effectStrategy);
      let clicks = 0;
      const view = () => (
        <Show when={true}>
          <ul>
            <For each={["a"]} by={(item) => item}>
              {(item) => <li onClick={() => clicks++}>{item()}</li>}
            </For>
          </ul>
        </Show>
      );

      hydrate(app, container, view);
      const li = container.querySelector("li")!;
      li.click();
      expect(clicks).toBe(1);
      app.dispose();
    });

    it("context resolves the same way on the server and during hydration", () => {
      const { app, container } = setup(effectStrategy);
      const Theme = createContext("root");
      let clicked = "";

      function Label() {
        const theme = useContext(Theme);
        return <button onClick={() => (clicked = theme)}>{theme}</button>;
      }

      const view = () => (
        <Provider context={Theme} value="dark">
          <Show when={true}>
            <Label />
          </Show>
        </Provider>
      );

      expect(renderToString(view())).toContain(">dark</button>");
      hydrate(app, container, view);
      const button = container.querySelector("button")!;
      button.click();
      expect(clicked).toBe("dark");
      app.dispose();
    });

    it("an empty For without a fallback hydrates and later mounts rows", () => {
      const { app, container, settle } = setup(effectStrategy);
      let items!: SignalAccessor<string[]>;

      function View() {
        items = useSignal<string[]>([]);
        return (
          <ul>
            <For each={items} by={(item) => item}>
              {(item) => <li>{item()}</li>}
            </For>
          </ul>
        );
      }

      hydrate(app, container, () => <View />);
      const list = container.querySelector("ul");
      settle(() => items(["a"]));
      expect(container.querySelector("ul")).toBe(list);
      expect(container.textContent).toBe("a");
      app.dispose();
    });

    it("a mismatch inside a slot falls back to a client mount of the root", () => {
      const { app, container } = setup(effectStrategy);
      container.innerHTML = renderToString(<div>{() => <b>server</b>}</div>);
      const serverDiv = container.querySelector("div");
      app.hydrate(<div>{() => <i>client</i>}</div>, container);
      expect(container.querySelector("i")?.textContent).toBe("client");
      expect(container.querySelector("b")).toBeNull();
      expect(container.querySelector("div")).not.toBe(serverDiv);
      app.dispose();
    });

    it("a different row count falls back to a client mount of the root", () => {
      const { app, container } = setup(effectStrategy);
      const list = (items: number[]) => (
        <ul>
          <For each={items} by={(item) => item}>
            {(item) => <li>{item()}</li>}
          </For>
        </ul>
      );
      container.innerHTML = renderToString(list([1, 2]));
      app.hydrate(list([1, 2, 3]), container);
      expect(container.textContent).toBe("123");
      app.dispose();
    });

    it("pre-row-marker For markup falls back to a client mount", () => {
      const { app, container } = setup(effectStrategy);
      container.innerHTML =
        "<ul><!--reflex-slot-start--><li>1</li><li>2</li><!--reflex-slot-end--></ul>";
      const serverLi = container.querySelector("li");
      app.hydrate(
        <ul>
          <For each={[1, 2]} by={(item) => item}>
            {(item) => <li>{item()}</li>}
          </For>
        </ul>,
        container,
      );
      expect(container.textContent).toBe("12");
      expect(container.querySelector("li")).not.toBe(serverLi);
      app.dispose();
    });
  });
});
