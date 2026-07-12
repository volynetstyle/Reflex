/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import { createApp, useEffectRender, useSignal } from "../src";

describe("runtime / DOM boundary", () => {
  it("keeps event-driven updates isolated between renderers", () => {
    const left = createApp();
    const right = createApp();
    const leftContainer = document.createElement("div");
    const rightContainer = document.createElement("div");

    function Counter() {
      const [count, setCount] = useSignal(0);
      return <button onClick={() => setCount((value) => value + 1)}>{count}</button>;
    }

    left.render(<Counter />, leftContainer);
    right.render(<Counter />, rightContainer);

    leftContainer.querySelector("button")!.click();
    expect(leftContainer.textContent).toBe("1");
    expect(rightContainer.textContent).toBe("0");
  });

  it("runs render effects after reactive DOM stabilization", () => {
    const app = createApp();
    const container = document.createElement("div");
    const log: string[] = [];

    function View() {
      const [count, setCount] = useSignal(0);
      useEffectRender(() => {
        count();
        log.push(container.textContent ?? "");
      });
      return <button onClick={() => setCount(1)}>{count}</button>;
    }

    app.render(<View />, container);
    expect(log).toEqual(["0"]);

    container.querySelector("button")!.click();
    expect(log).toEqual(["0", "1"]);
  });
});
