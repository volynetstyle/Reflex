/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it } from "vitest";
import { signal } from "@volynets/reflex";
import {
  Portal,
  createDOMRuntime,
  hydrate,
  render,
  renderToString,
  resume,
} from "../src";

describe("SSR, hydration, portals, and resume", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  it("hydrates SSR markup without recreating the DOM node and resumes reactive updates", () => {
    const container = document.createElement("div");
    const [count, setCount] = signal(0);

    const view = (
      <button
        class={() => (count() === 0 ? "idle" : "active")}
        type="button"
        onClick={() => setCount((value) => value + 1)}
      >
        count: {count}
      </button>
    );

    container.innerHTML = renderToString(view);
    const hydratedButton = container.querySelector("button") as HTMLButtonElement;

    expect(hydratedButton.textContent).toBe("count: 0");

    const dispose = hydrate(view, container);

    expect(container.querySelector("button")).toBe(hydratedButton);

    hydratedButton.click();

    expect(hydratedButton.textContent).toBe("count: 1");
    expect(hydratedButton.getAttribute("class")).toBe("active");

    dispose();
    expect(container.innerHTML).toBe("");
  });

  it("adopts existing SSR DOM with resume without mutating it", () => {
    const container = document.createElement("div");
    container.innerHTML = `<section data-ssr="yes"><span>server</span></section>`;

    const preservedSection = container.querySelector("section");
    const dispose = resume(container);

    expect(container.querySelector("section")).toBe(preservedSection);
    expect(container.textContent).toBe("server");

    dispose();

    expect(container.innerHTML).toBe("");
  });

  it("renders portals into an external target and cleans them up with the parent tree", () => {
    const source = document.createElement("div");
    const target = document.createElement("div");

    const dispose = render(
      <section>
        source
        <Portal to={target}>
          <span>teleported</span>
        </Portal>
      </section>,
      source,
    );

    expect(source.textContent).toContain("source");
    expect(source.textContent).not.toContain("teleported");
    expect(target.textContent).toBe("teleported");

    dispose();

    expect(target.innerHTML).toBe("");
  });
});
