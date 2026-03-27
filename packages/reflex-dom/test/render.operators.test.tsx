/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it } from "vitest";
import { effect, signal } from "@volynetstyle/reflex";
import { createDOMRuntime, For, Show, Switch, render } from "../src";

describe("render structural operators and leaf dataflow", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  it("updates reactive text children without replacing the text node", () => {
    const container = document.createElement("div");
    const [count, setCount] = signal(0);

    render(<p>{count}</p>, container);

    const text = Array.from(container.querySelector("p")?.childNodes ?? []).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    expect(text?.textContent).toBe("0");

    setCount(1);

    const nextText = Array.from(container.querySelector("p")?.childNodes ?? []).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    expect(nextText).toBe(text);
    expect(text?.textContent).toBe("1");
  });

  it("renders Show with fallback and swaps branches", () => {
    const container = document.createElement("div");
    const [visible, setVisible] = signal(true);

    render(
      <Show when={visible} fallback={<b>hidden</b>}>
        <span>shown</span>
      </Show>,
      container,
    );

    expect(container.querySelector("span")?.textContent).toBe("shown");
    expect(container.querySelector("b")).toBeNull();

    setVisible(false);
    expect(container.querySelector("span")).toBeNull();
    expect(container.querySelector("b")?.textContent).toBe("hidden");

    setVisible(true);
    expect(container.querySelector("span")?.textContent).toBe("shown");
    expect(container.querySelector("b")).toBeNull();
  });

  it("disposes Show branch effects when the condition turns false", () => {
    const container = document.createElement("div");
    const [visible, setVisible] = signal(true);
    const log: string[] = [];

    function Child() {
      effect(() => {
        log.push("run");
        return () => {
          log.push("cleanup");
        };
      });

      return <span>child</span>;
    }

    render(
      <Show when={visible}>
        <Child />
      </Show>,
      container,
    );

    expect(log).toEqual(["run"]);

    setVisible(false);

    expect(container.querySelector("span")).toBeNull();
    expect(log).toEqual(["run", "cleanup"]);
  });

  it("renders Switch cases and falls back when no case matches", () => {
    const container = document.createElement("div");
    const [status, setStatus] = signal("idle");

    render(
      <Switch
        value={status}
        cases={[
          { when: "idle", children: <span>idle</span> },
          { when: "done", children: <span>done</span> },
        ]}
        fallback={<span>other</span>}
      />,
      container,
    );

    expect(container.textContent).toBe("idle");

    setStatus("done");
    expect(container.textContent).toBe("done");

    setStatus("unknown");
    expect(container.textContent).toBe("other");
  });

  it("reorders keyed For rows without recreating stable row DOM nodes", () => {
    const container = document.createElement("div");
    const a = { id: "a", label: "A" };
    const b = { id: "b", label: "B" };
    const c = { id: "c", label: "C" };
    const [items, setItems] = signal([a, b, c] as const);

    render(
      <ul>
        <For each={items} by={(item) => item.id}>
          {(item) => <li data-id={item.id}>{item.label}</li>}
        </For>
      </ul>,
      container,
    );

    const originalB = container.querySelector('[data-id="b"]');
    expect(container.textContent).toBe("ABC");

    setItems([c, b, a]);

    expect(container.textContent).toBe("CBA");
    expect(container.querySelector('[data-id="b"]')).toBe(originalB);
  });

  it("preserves prefix and suffix rows when inserting into the middle", () => {
    const container = document.createElement("div");
    const a = { id: "a", label: "A" };
    const b = { id: "b", label: "B" };
    const c = { id: "c", label: "C" };
    const [items, setItems] = signal([a, c] as const);

    render(
      <ul>
        <For each={items} by={(item) => item.id}>
          {(item) => <li data-id={item.id}>{item.label}</li>}
        </For>
      </ul>,
      container,
    );

    const originalA = container.querySelector('[data-id="a"]');
    const originalC = container.querySelector('[data-id="c"]');

    setItems([a, b, c]);

    expect(container.textContent).toBe("ABC");
    expect(container.querySelector('[data-id="a"]')).toBe(originalA);
    expect(container.querySelector('[data-id="c"]')).toBe(originalC);
  });

  it("throws on duplicate keys in For", () => {
    const container = document.createElement("div");

    expect(() => {
      render(
        <ul>
          <For
            each={[
              { id: "dup", label: "A" },
              { id: "dup", label: "B" },
            ]}
            by={(item) => item.id}
          >
            {(item) => <li>{item.label}</li>}
          </For>
        </ul>,
        container,
      );
    }).toThrowError("Duplicate key in <For>: dup");
  });
});
