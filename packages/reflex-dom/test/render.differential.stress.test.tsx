/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import { createApp, For, useSignal } from "../src";

interface Item {
  id: number;
  label: string;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function mutate(items: Item[], next: () => number, freshId: () => number): void {
  const choice = items.length === 0 ? 0 : next() % 4;
  if (choice === 0) {
    const index = next() % (items.length + 1);
    const id = freshId();
    items.splice(index, 0, { id, label: `item-${id}` });
  } else if (choice === 1) {
    items.splice(next() % items.length, 1);
  } else if (choice === 2) {
    const from = next() % items.length;
    const [item] = items.splice(from, 1);
    items.splice(next() % (items.length + 1), 0, item!);
  } else {
    const index = next() % items.length;
    const item = items[index]!;
    items[index] = { id: item.id, label: `changed-${next()}` };
  }
}

describe("DOM renderer differential stress", () => {
  it.each([
    ["eager", 0x12345678],
    ["eager", 0xdeadbeef],
    ["sab", 0x12345678],
    ["sab", 0xdeadbeef],
    ["flush", 0x12345678],
    ["flush", 0xdeadbeef],
  ] as const)("matches a plain DOM list for %s, seed %i", async (strategy, seed) => {
    const next = random(seed);
    const app = createApp({ effectStrategy: strategy });
    const container = document.createElement("div");
    const foreign = document.createElement("header");
    foreign.textContent = "foreign";
    container.append(foreign);
    let setItems!: (items: Item[]) => void;
    let setVisible!: (visible: boolean) => void;
    let items: Item[] = [];
    let visible = true;
    let id = 0;

    function View() {
      const currentItems = useSignal([] as Item[]);
      const isVisible = useSignal(true);
      setItems = currentItems;
      setVisible = isVisible;
      return (
        <section>
          {() => isVisible() ? (
            <ul>
              <For
                each={currentItems}
                by={(item) => item.id}
                fallback={<li data-empty="true">empty</li>}
              >
                {(item) => <li data-id={item.id} title={item.label}>{item.label}</li>}
              </For>
            </ul>
          ) : <p data-hidden="true">hidden</p>}
        </section>
      );
    }

    const dispose = app.render(<View />, container);
    const runtime = app.renderer.execution.runtime!;
    const reference = document.createElement("div");
    const expectedMarkup = () => {
      reference.replaceChildren();
      const section = document.createElement("section");
      if (visible) {
        const list = document.createElement("ul");
        if (items.length === 0) {
          const empty = document.createElement("li");
          empty.dataset.empty = "true";
          empty.textContent = "empty";
          list.append(empty);
        } else {
          for (const item of items) {
            const row = document.createElement("li");
            row.dataset.id = String(item.id);
            row.title = item.label;
            row.textContent = item.label;
            list.append(row);
          }
        }
        section.append(list);
      } else {
        const hidden = document.createElement("p");
        hidden.dataset.hidden = "true";
        hidden.textContent = "hidden";
        section.append(hidden);
      }
      reference.append(section);
      return section.outerHTML;
    };
    const actualMarkup = () => {
      const section = container.querySelector("section")!;
      // Managed range comments are internal; compare the visible element tree.
      const clone = section.cloneNode(true) as HTMLElement;
      const comments = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
      const toRemove: Node[] = [];
      while (comments.nextNode()) toRemove.push(comments.currentNode);
      for (const comment of toRemove) comment.remove();
      return clone.outerHTML;
    };

    for (let step = 0; step < 180; step++) {
      const beforeItems = new Map(items.map((item) => [item.id, item]));
      const beforeNodes = new Map(
        Array.from(container.querySelectorAll<HTMLLIElement>("li[data-id]"), (node) => [
          Number(node.dataset.id),
          node,
        ]),
      );
      const wasVisible = visible;
      const mutations = 1 + (next() % 4);
      const nextItems = items.slice();
      const outsideBatch = strategy !== "sab" && step % 7 === 0;
      const apply = () => {
        for (let index = 0; index < mutations; index++) {
          mutate(nextItems, next, () => ++id);
          setItems(nextItems.slice());
        }
        if (step % 23 === 0) {
          visible = !visible;
          setVisible(visible);
        }
      };
      if (outsideBatch) runtime.run(apply);
      else runtime.batch(() => runtime.batch(apply));
      items = nextItems;

      if (strategy === "flush") {
        if (step % 11 === 0) runtime.flush();
        else await Promise.resolve();
      }

      const context = `strategy=${strategy} seed=${seed} step=${step}`;
      expect(actualMarkup(), context).toBe(expectedMarkup());
      expect(container.firstChild, context).toBe(foreign);
      if (wasVisible && visible) {
        for (const item of items) {
          if (beforeItems.get(item.id) !== item) continue;
          const previous = beforeNodes.get(item.id);
          if (previous) {
            expect(container.querySelector(`li[data-id="${item.id}"]`), context).toBe(previous);
          }
        }
      }
    }

    dispose();
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(foreign);
  });
});
