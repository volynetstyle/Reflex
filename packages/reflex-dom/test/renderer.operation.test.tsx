/** @jsxImportSource ../src */
import { describe, expect, it } from "vitest";
import { createDOMRenderer, useMountedEffect, useSignal } from "../src";
import { getActiveDOMContext, getDOMContext } from "../src/runtime/context";

describe("public DOM operation boundaries", () => {
  it.each(["render", "mount", "hydrate"] as const)(
    "%s starts mounted effects after the complete tree is attached",
    (operation) => {
      const renderer = createDOMRenderer();
      const container = document.createElement("div");
      const observed: string[] = [];
      function Child() {
        useMountedEffect(() => {
          expect(getDOMContext()).toBe(renderer.execution);
          observed.push(container.textContent!);
        });
        return <span>first</span>;
      }
      if (operation === "hydrate") {
        container.innerHTML = "<div><span>first</span><span>last</span></div>";
      }
      const dispose = renderer[operation](
        <div>
          <Child />
          <span>last</span>
        </div>,
        container,
      );
      try {
        expect(observed).toEqual(["firstlast"]);
        expect(getActiveDOMContext()).toBeNull();
      } finally {
        dispose();
      }
    },
  );

  it.each([false, true])(
    "resume settles its operation when an existing root is %s",
    (existing) => {
      const renderer = createDOMRenderer();
      const container = document.createElement("div");
      container.innerHTML = "<p>ready</p>";
      const original = existing ? renderer.resume(container) : undefined;
      const observed: string[] = [];
      renderer.mountEffects.schedule(() => {
        expect(getDOMContext()).toBe(renderer.execution);
        observed.push(container.textContent!);
      });
      const dispose = renderer.resume(container);
      try {
        expect(observed).toEqual(["ready"]);
        expect(getActiveDOMContext()).toBeNull();
      } finally {
        dispose();
        original?.();
      }
      expect(container.childNodes).toHaveLength(0);
    },
  );

  it("delivers external reactive updates automatically in flush mode", async () => {
    const renderer = createDOMRenderer({ effectStrategy: "flush" });
    const container = document.createElement("div");
    const values: number[] = [];
    let set!: (value: number) => void;
    function View() {
      const value = useSignal(0);
      set = value;
      return (
        <p>
          {() => {
            const current = value();
            values.push(current);
            return current;
          }}
        </p>
      );
    }
    const dispose = renderer.render(<View />, container);
    try {
      values.length = 0;
      set(1);
      set(2);
      set(3);
      expect(container.textContent).toBe("0");
      expect(values).toEqual([]);
      await Promise.resolve();
      expect(container.textContent).toBe("3");
      expect(values).toEqual([3]);
    } finally {
      dispose();
    }
  });

  it("provides the runtime context for DOM event handlers", async () => {
    const renderer = createDOMRenderer({ effectStrategy: "flush" });
    const container = document.createElement("div");
    function Counter() {
      const count = useSignal(0);
      return (
        <button onClick={() => count((value) => value + 1)}>{count}</button>
      );
    }
    const dispose = renderer.render(<Counter />, container);
    try {
      container.querySelector("button")!.click();
      expect(container.textContent).toBe("0");
      await Promise.resolve();
      expect(container.textContent).toBe("1");
    } finally {
      dispose();
    }
  });
});
