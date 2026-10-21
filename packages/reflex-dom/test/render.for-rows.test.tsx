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
            <li class={() => (selected() === item().id ? "on" : null)}>
              {item().label}
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
          {(item) => <li>{item().label}</li>}
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
          {(item) => <Row item={item()} />}
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
          {(item) => <li>{item().label}</li>}
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
              <b>{item().id}</b>
            </Show>,
            <span>{() => item().label}</span>,
            () => (visible() ? "!" : ""),
          ]}
        </For>
      </div>,
      container,
    );
    const root = container.querySelector("div")!;
    const labels = () =>
      Array.from(root.querySelectorAll("span"), (n) => n.textContent);

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
          {(item) => (item().id === 2 ? null : item().label)}
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

  it("keeps the row, its DOM and its state when the item object changes", () => {
    const container = document.createElement("div");
    const [rows, setRows] = signal(items(1, 2));
    const events: string[] = [];

    function Row(props: { item: () => Item }) {
      const id = props.item().id;
      events.push(`mount ${id}`);
      useUnmount(() => events.push(`unmount ${id}`));
      return (
        <li>
          <input />
          <span>{() => props.item().label}</span>
        </li>
      );
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
    const first = list.children[0]!;
    first.querySelector("input")!.value = "typed";

    setRows([
      { id: 1, label: "one" },
      { id: 2, label: "item 2" },
    ]);

    expect(events).toEqual(["mount 1", "mount 2"]);
    expect(list.children[0]).toBe(first);
    expect(first.querySelector("input")!.value).toBe("typed");
    expect(texts(list)).toEqual(["one", "item 2"]);

    setRows([
      { id: 2, label: "two" },
      { id: 1, label: "uno" },
    ]);

    expect(events).toEqual(["mount 1", "mount 2"]);
    expect(list.children[1]).toBe(first);
    expect(texts(list)).toEqual(["two", "uno"]);

    setRows(items(2));
    expect(events).toEqual(["mount 1", "mount 2", "unmount 1"]);
  });

  it("passes the current index to rows that read it", () => {
    const container = document.createElement("div");
    const a = { id: 1, label: "a" };
    const b = { id: 2, label: "b" };
    const c = { id: 3, label: "c" };
    const [rows, setRows] = signal([a, b, c]);
    let mounts = 0;

    render(
      <ul>
        <For each={rows} by={(item) => item.id}>
          {(item, index) => {
            mounts++;
            return (
              <li>
                {item().label}:{index}
              </li>
            );
          }}
        </For>
      </ul>,
      container,
    );
    const list = container.querySelector("ul")!;

    setRows([c, a, b]);
    expect(texts(list)).toEqual(["c:0", "a:1", "b:2"]);

    setRows([{ id: 0, label: "z" }, c, a, b]);
    expect(texts(list)).toEqual(["z:0", "c:1", "a:2", "b:3"]);

    setRows([a]);
    expect(texts(list)).toEqual(["a:0"]);
    expect(mounts).toBe(4);
  });

  it("reads untracked item values once, at mount", () => {
    const container = document.createElement("div");
    const [rows, setRows] = signal(items(1));

    render(
      <ul>
        <For each={rows} by={(item) => item.id}>
          {(item) => <li>{item().label}</li>}
        </For>
      </ul>,
      container,
    );

    setRows([{ id: 1, label: "next" }]);

    expect(texts(container.querySelector("ul")!)).toEqual(["item 1"]);
  });

  it("tracks reads after an untracked read of the same row", () => {
    const container = document.createElement("div");
    const [rows, setRows] = signal(items(1));

    render(
      <ul>
        <For each={rows} by={(item) => item.id}>
          {(item, index) => (
            <li>
              <b>{item().label}</b>
              <i>{index()}</i>
              <span>{() => item().label}</span>
              <s>{index}</s>
            </li>
          )}
        </For>
      </ul>,
      container,
    );
    const row = () => container.querySelector("li")!;

    setRows([{ id: 0, label: "zero" }, { id: 1, label: "one" }]);

    const second = container.querySelectorAll("li")[1]!;
    expect(second.querySelector("b")!.textContent).toBe("item 1");
    expect(second.querySelector("i")!.textContent).toBe("0");
    expect(second.querySelector("span")!.textContent).toBe("one");
    expect(second.querySelector("s")!.textContent).toBe("1");
    expect(row().querySelector("span")!.textContent).toBe("zero");
  });
});
