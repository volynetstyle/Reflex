/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it } from "vitest";
import { signal } from "./reactivity";
import { createDOMRuntime, For, Show, render, useUnmount } from "../src";

interface Item {
  readonly id: number;
  readonly label: string;
}

const items = (...ids: number[]): Item[] =>
  ids.map((id) => ({ id, label: `item ${id}` }));

const texts = (parent: Element) =>
  Array.from(parent.children, (child) => child.textContent);

describe("For rows", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  it("does not subscribe the list to the bindings of mounted rows", () => {
    const container = document.createElement("div");
    const [rows, setRows] = signal(items(1, 2));
    const [selected, setSelected] = signal(0);
    let listReads = 0;

    render(
      <ul>
        <For
          each={() => {
            listReads++;
            return rows();
          }}
          by={(item) => item.id}
        >
          {(item) => (
            <li class={() => (selected() === item.id ? "on" : null)}>
              {item.label}
            </li>
          )}
        </For>
      </ul>,
      container,
    );

    // Rows mounted by the reaction, not by the initial render.
    setRows(items(1, 2, 3));
    const reads = listReads;

    setSelected(3);

    expect(listReads).toBe(reads);
    expect(container.querySelector(".on")?.textContent).toBe("item 3");
  });

  it("renders rows without per-row anchors", () => {
    const container = document.createElement("div");

    render(
      <ul>
        <For each={items(1, 2, 3)} by={(item) => item.id}>
          {(item) => <li>{item.label}</li>}
        </For>
      </ul>,
      container,
    );

    expect(container.querySelector("ul")!.innerHTML).toBe(
      "<!----><li>item 1</li><li>item 2</li><li>item 3</li><!---->",
    );
  });

  it("clears and replaces rows when the list owns its parent", () => {
    const container = document.createElement("div");
    const [rows, setRows] = signal(items(1, 2, 3));
    let disposed = 0;

    function Row(props: { item: Item }) {
      useUnmount(() => {
        disposed++;
      });
      return <li>{props.item.label}</li>;
    }

    render(
      <ul>
        <For each={rows} by={(item) => item.id}>
          {(item) => <Row item={item} />}
        </For>
      </ul>,
      container,
    );
    const list = container.querySelector("ul")!;

    setRows(items(4, 5));
    expect(texts(list)).toEqual(["item 4", "item 5"]);
    expect(disposed).toBe(3);

    setRows([]);
    expect(list.innerHTML).toBe("<!----><!---->");
    expect(disposed).toBe(5);

    setRows(items(6));
    expect(texts(list)).toEqual(["item 6"]);
  });

  it("clears only its own rows when the parent has other children", () => {
    const container = document.createElement("div");
    const [rows, setRows] = signal(items(1, 2));

    render(
      <ul>
        <li>before</li>
        <For each={rows} by={(item) => item.id}>
          {(item) => <li>{item.label}</li>}
        </For>
        <li>after</li>
      </ul>,
      container,
    );
    const list = container.querySelector("ul")!;

    setRows(items(3, 4));
    expect(texts(list)).toEqual(["before", "item 3", "item 4", "after"]);

    setRows([]);
    expect(texts(list)).toEqual(["before", "after"]);
  });

  it("moves, updates and removes rows bounded by nested slots", () => {
    const container = document.createElement("div");
    const [rows, setRows] = signal(items(1, 2, 3));
    const [visible, setVisible] = signal(true);

    render(
      <div>
        <For each={rows} by={(item) => item.id}>
          {(item) => [
            <Show when={visible}>
              <b>{item.id}</b>
            </Show>,
            <span>{item.label}</span>,
            () => (visible() ? "!" : ""),
          ]}
        </For>
      </div>,
      container,
    );
    const root = container.querySelector("div")!;
    const labels = () => Array.from(root.querySelectorAll("span"), (n) => n.textContent);

    setRows(items(3, 1, 2));
    expect(labels()).toEqual(["item 3", "item 1", "item 2"]);
    expect(root.textContent).toBe("3item 3!1item 1!2item 2!");

    setRows([{ id: 3, label: "three" }, ...items(2)]);
    expect(labels()).toEqual(["three", "item 2"]);
    expect(root.textContent).toBe("3three!2item 2!");

    setVisible(false);
    expect(root.textContent).toBe("threeitem 2");

    setRows(items(2));
    expect(root.textContent).toBe("item 2");
  });

  it("represents empty row content and keeps its position", () => {
    const container = document.createElement("div");
    const [rows, setRows] = signal(items(1, 2, 3));

    render(
      <p>
        <For each={rows} by={(item) => item.id}>
          {(item) => (item.id === 2 ? null : item.label)}
        </For>
      </p>,
      container,
    );
    const paragraph = container.querySelector("p")!;

    expect(paragraph.textContent).toBe("item 1item 3");
    setRows(items(3, 2, 1));
    expect(paragraph.textContent).toBe("item 3item 1");
    setRows([items(3)[0]!, { id: 2, label: "two" }, items(1)[0]!]);
    expect(paragraph.textContent).toBe("item 3item 1");
  });

  it("unmounts the previous content of an updated row before mounting the next", () => {
    const container = document.createElement("div");
    const [rows, setRows] = signal(items(1));
    const events: string[] = [];

    function Row(props: { item: Item }) {
      events.push(`mount ${props.item.label}`);
      useUnmount(() => events.push(`unmount ${props.item.label}`));
      return <li>{props.item.label}</li>;
    }

    render(
      <ul>
        <For each={rows} by={(item) => item.id}>
          {(item) => <Row item={item} />}
        </For>
      </ul>,
      container,
    );

    setRows([{ id: 1, label: "next" }]);

    expect(events).toEqual(["mount item 1", "unmount item 1", "mount next"]);
    expect(texts(container.querySelector("ul")!)).toEqual(["next"]);
  });
});
