/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import { signal } from "@volynets/reflex";
import { createApp, render, setupDOM } from "../src";

describe("plug-and-play DOM setup", () => {
  it("creates an isolated app renderer", () => {
    const app = createApp();
    const container = document.createElement("div");
    const [count, setCount] = signal(1);

    app.render(<button type="button">count: {count}</button>, container);

    expect(container.textContent).toBe("count: 1");

    setCount(2);

    expect(container.textContent).toBe("count: 2");
  });

  it("installs an app as the active singleton renderer", () => {
    const container = document.createElement("div");

    setupDOM();
    render(<main>ready</main>, container);

    expect(container.textContent).toBe("ready");
  });
});
