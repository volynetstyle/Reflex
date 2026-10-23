/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import type { EffectStrategy } from "@volynets/reflex-scheduler";
import {
  createApp,
  For,
  onCleanup,
  renderToString,
  Show,
  Switch,
  useOwned,
  useSignal,
  type JSXRenderable,
  type SignalAccessor,
} from "../src";

interface Item {
  id: string;
  label: string;
}

const strategies: EffectStrategy[] = ["eager", "sab", "flush"];

describe.each(strategies)("structure identity (%s)", (effectStrategy) => {
  function setup() {
    const app = createApp({ effectStrategy });
    const container = document.createElement("div");
    const update = (fn: () => void) => {
      app.renderer.batch(fn);
      app.renderer.flush();
    };
    return { app, container, update };
  }

  function hydrateFromServer(
    app: ReturnType<typeof createApp>,
    container: HTMLElement,
    view: () => JSXRenderable,
  ) {
    container.innerHTML = renderToString(view());
    return app.hydrate(view(), container);
  }

  it("R2: a new object under the same key keeps the row and its state", () => {
    const { app, container, update } = setup();
    const log: string[] = [];
    let items!: SignalAccessor<Item[]>;

    function Row({ item }: { item: () => Item }) {
      const local = useSignal(0);
      onCleanup(() => log.push(`cleanup:${item().id}`));
      return (
        <li onClick={() => local((value) => value + 1)}>
          {() => `${item().label}:${local()}`}
        </li>
      );
    }

    function View() {
      items = useSignal([{ id: "a", label: "old" }]);
      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item) => <Row item={item} />}
          </For>
        </ul>
      );
    }

    app.render(<View />, container);
    const li = container.querySelector("li")!;
    li.click();
    app.renderer.flush();
    update(() => items([{ id: "a", label: "new" }]));
    expect(container.querySelector("li")).toBe(li);
    expect(li.textContent).toBe("new:1");
    expect(log).toEqual([]);
    app.dispose();
    expect(log).toEqual(["cleanup:a"]);
  });

  it("R3: index follows moves without recreating rows", () => {
    const { app, container, update } = setup();
    const a = { id: "a", label: "a" };
    const b = { id: "b", label: "b" };
    let items!: SignalAccessor<Item[]>;

    function View() {
      items = useSignal([a, b]);
      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item, index) => <li>{() => `${item().label}:${index()}`}</li>}
          </For>
        </ul>
      );
    }

    app.render(<View />, container);
    const [first, second] = container.querySelectorAll("li");
    update(() => items([b, a]));
    expect(container.textContent).toBe("b:0a:1");
    expect(Array.from(container.querySelectorAll("li"))).toEqual([
      second,
      first,
    ]);
    app.dispose();
  });

  it("R4: resources created in the row callback close with the row", () => {
    const { app, container, update } = setup();
    const log: string[] = [];
    let items!: SignalAccessor<Item[]>;

    function View() {
      items = useSignal([
        { id: "a", label: "a" },
        { id: "b", label: "b" },
      ]);
      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item) => {
              const id = item().id;
              useOwned(
                () => id,
                () => log.push(`row:${id}`),
              );
              return <li>{id}</li>;
            }}
          </For>
        </ul>
      );
    }

    app.render(<View />, container);
    update(() => items([{ id: "b", label: "b" }]));
    expect(log).toEqual(["row:a"]);
    expect(container.textContent).toBe("b");
    app.dispose();
    expect(log).toEqual(["row:a", "row:b"]);
  });

  it("R8: handlers and components inside dynamic slots activate on hydrate", () => {
    const { app, container, update } = setup();
    const log: string[] = [];
    let mode!: SignalAccessor<string>;

    function Leaf({ name }: { name: string }) {
      onCleanup(() => log.push(`cleanup:${name}`));
      return <i onClick={() => log.push(`leaf:${name}`)}>{name}</i>;
    }

    function View() {
      mode = useSignal("a");
      return (
        <div>
          {() => <button onClick={() => log.push("accessor")}>go</button>}
          <Show when={true}>
            <Leaf name="show" />
          </Show>
          <Switch
            value={mode}
            cases={[{ when: "a", children: <Leaf name="case-a" /> }]}
            fallback={<Leaf name="fallback" />}
          />
        </div>
      );
    }

    hydrateFromServer(app, container, () => <View />);
    log.length = 0; // The server pass runs and disposes its own components.
    const button = container.querySelector("button")!;
    button.click();
    for (const leaf of container.querySelectorAll("i")) leaf.click();
    expect(log).toEqual(["accessor", "leaf:show", "leaf:case-a"]);
    update(() => mode("b"));
    expect(log).toContain("cleanup:case-a");
    expect(container.textContent).toBe("goshowfallback");
    expect(container.querySelector("button")).toBe(button);
    app.dispose();
    expect(log).toContain("cleanup:show");
    expect(log).toContain("cleanup:fallback");
  });

  it("R9: hydrated For rows keep keyed identity and row state", () => {
    const { app, container, update } = setup();
    const log: string[] = [];
    const a = { id: "a", label: "A" };
    const b = { id: "b", label: "B" };
    let items!: SignalAccessor<Item[]>;

    function View() {
      items = useSignal([a, b]);
      return (
        <ul>
          <For
            each={items}
            by={(item) => item.id}
            fallback={<li data-empty="true">empty</li>}
          >
            {(item, index) => {
              onCleanup(() => log.push(`cleanup:${item().id}`));
              return (
                <li
                  data-id={item().id}
                  onClick={() => log.push(`click:${item().label}`)}
                >
                  {() => `${item().label}${index()}`}
                </li>
              );
            }}
          </For>
        </ul>
      );
    }

    hydrateFromServer(app, container, () => <View />);
    log.length = 0; // The server pass runs and disposes its own components.
    const rowA = container.querySelector('[data-id="a"]')!;
    const rowB = container.querySelector('[data-id="b"]')!;
    expect(container.textContent).toBe("A0B1");
    update(() => items([b, { id: "a", label: "A2" }]));
    expect(container.querySelector('[data-id="a"]')).toBe(rowA);
    expect(container.querySelector('[data-id="b"]')).toBe(rowB);
    expect(container.textContent).toBe("B0A21");
    (rowA as HTMLElement).click();
    expect(log).toEqual(["click:A2"]);
    update(() => items([]));
    expect(log).toEqual(["click:A2", "cleanup:b", "cleanup:a"]);
    expect(container.textContent).toBe("empty");
    app.dispose();
  });

  it("R9: an empty server list hydrates its fallback and then mounts rows", () => {
    const { app, container, update } = setup();
    let items!: SignalAccessor<Item[]>;

    function View() {
      items = useSignal<Item[]>([]);
      return (
        <ul>
          <For
            each={items}
            by={(item) => item.id}
            fallback={<li data-empty="true">empty</li>}
          >
            {(item) => <li>{() => item().label}</li>}
          </For>
        </ul>
      );
    }

    hydrateFromServer(app, container, () => <View />);
    const fallback = container.querySelector("[data-empty]");
    expect(fallback).not.toBeNull();
    update(() => items([{ id: "a", label: "A" }]));
    expect(container.textContent).toBe("A");
    app.dispose();
  });

  it("M5: a listener object's AbortSignal detaches the handler", () => {
    const { app, container } = setup();
    const controller = new AbortController();
    let calls = 0;

    app.render(
      <button
        onClick={{
          handleEvent: () => {
            calls++;
          },
          signal: controller.signal,
        }}
      />,
      container,
    );
    const button = container.querySelector("button")!;
    button.click();
    controller.abort();
    button.click();
    expect(calls).toBe(1);
    app.dispose();
  });
});
