/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it } from "vitest";
import { signal } from "./reactivity";
import { createDOMRuntime, For, Show, render } from "../src";

describe("reactive children of elements", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  it("updates one text node in place, without anchors, reading once per run", () => {
    const container = document.createElement("div");
    const [count, setCount] = signal(1);
    let reads = 0;

    render(
      <p>
        count: {() => {
          reads++;
          return count();
        }}
      </p>,
      container,
    );
    const paragraph = container.querySelector("p")!;
    const text = paragraph.lastChild;

    expect(paragraph.innerHTML).toBe("count: 1");
    expect(reads).toBe(1);

    setCount(2);

    expect(paragraph.innerHTML).toBe("count: 2");
    expect(paragraph.lastChild).toBe(text);
    expect(reads).toBe(2);
  });

  it("keeps the position of empty values", () => {
    const container = document.createElement("div");
    const [value, setValue] = signal<string | null>(null);

    render(
      <p>
        a{value}b
      </p>,
      container,
    );
    const paragraph = container.querySelector("p")!;

    expect(paragraph.textContent).toBe("ab");
    setValue("-");
    expect(paragraph.textContent).toBe("a-b");
    setValue(null);
    expect(paragraph.textContent).toBe("ab");
  });

  it("switches between text and structural content in place", () => {
    const container = document.createElement("div");
    const [rich, setRich] = signal(false);

    render(
      <p>
        a{() => (rich() ? <b>bold</b> : "plain")}c
      </p>,
      container,
    );
    const paragraph = container.querySelector("p")!;

    expect(paragraph.textContent).toBe("aplainc");
    setRich(true);
    expect(paragraph.querySelector("b")?.textContent).toBe("bold");
    expect(paragraph.textContent).toBe("aboldc");
    setRich(false);
    expect(paragraph.querySelector("b")).toBeNull();
    expect(paragraph.textContent).toBe("aplainc");
  });

  it("starts with structural content when the first value is not text", () => {
    const container = document.createElement("div");
    const [rich, setRich] = signal(true);

    render(
      <p>
        a{() => (rich() ? <b>bold</b> : "plain")}c
      </p>,
      container,
    );
    const paragraph = container.querySelector("p")!;

    expect(paragraph.textContent).toBe("aboldc");
    setRich(false);
    expect(paragraph.textContent).toBe("aplainc");
  });

  it("does not touch the nodes of rows that are already removed", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [rows, setRows] = signal([1, 2, 3]);

    render(
      <ul>
        <For each={rows} by={(id) => id}>
          {(id) => <li>{() => `row ${id()}`}</li>}
        </For>
      </ul>,
      container,
    );
    const list = container.querySelector("ul")!;
    const removed: Node[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) removed.push(...record.removedNodes);
    });
    observer.observe(list, { childList: true, subtree: true });

    setRows([2]);
    await Promise.resolve();
    observer.disconnect();

    expect(removed.map((node) => node.nodeName)).toEqual(["LI", "LI"]);
    expect(list.textContent).toBe("row 2");
  });

  it("stops updating and removes its node when its owner is disposed", () => {
    const container = document.createElement("div");
    const [visible, setVisible] = signal(true);
    const [count, setCount] = signal(1);
    let reads = 0;

    render(
      <div>
        <Show when={visible}>
          <span>
            {() => {
              reads++;
              return count();
            }}
          </span>
        </Show>
      </div>,
      container,
    );

    setVisible(false);
    const before = reads;
    setCount(2);

    expect(reads).toBe(before);
    expect(container.querySelector("span")).toBeNull();
  });
});
