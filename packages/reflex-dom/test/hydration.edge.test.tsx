/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it } from "vitest";
import { signal } from "@volynets/reflex";
import { createDOMRuntime, hydrate, render, renderToString } from "../src";

describe("hydration edge cases", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  it("falls back to remounting when the root tag does not match", () => {
    const container = document.createElement("div");
    const view = <section data-kind="expected">fresh</section>;

    container.innerHTML = "<article data-kind=\"stale\">stale</article>";
    const staleNode = container.firstElementChild;

    hydrate(view, container);

    expect(container.querySelector("section")?.getAttribute("data-kind")).toBe("expected");
    expect(container.textContent).toBe("fresh");
    expect(container.firstElementChild).not.toBe(staleNode);
  });

  it("falls back when SSR markers for an accessor slot are missing", () => {
    const container = document.createElement("div");
    const [count, setCount] = signal(1);
    const view = <div>count: {count}</div>;

    container.innerHTML = "<div>count: 1</div>";
    const staleDiv = container.querySelector("div");

    hydrate(view, container);
    expect(container.querySelector("div")).not.toBe(staleDiv);
    expect(container.textContent).toBe("count: 1");

    setCount(2);
    expect(container.textContent).toBe("count: 2");
  });

  it("hydrates textarea value bindings without trying to hydrate light DOM children", () => {
    const container = document.createElement("div");
    const [value, setValue] = signal("hello");
    const view = <textarea value={value}>ignored</textarea>;

    container.innerHTML = renderToString(view);
    const existingTextarea = container.querySelector("textarea");

    hydrate(view, container);

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBe(existingTextarea);
    expect(textarea.value).toBe("hello");
    expect(textarea.textContent).toBe("hello");

    setValue("world");
    expect(textarea.value).toBe("world");
  });

  it("replaces an existing managed root when hydrating a new SSR view", () => {
    const container = document.createElement("div");
    const [count, setCount] = signal(0);

    const interactiveView = (
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        interactive: {count}
      </button>
    );
    const ssrView = <p>server ready</p>;

    const disposeRender = render(interactiveView, container);
    const oldButton = container.querySelector("button");
    expect(oldButton?.textContent).toBe("interactive: 0");

    container.innerHTML = renderToString(ssrView);
    const hydratedParagraph = container.querySelector("p");

    const disposeHydrate = hydrate(ssrView, container);

    expect(container.querySelector("p")).toBe(hydratedParagraph);
    expect(container.querySelector("button")).toBeNull();

    disposeRender();
    expect(container.querySelector("p")).toBe(hydratedParagraph);

    disposeHydrate();
    expect(container.innerHTML).toBe("");
  });
});
