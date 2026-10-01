/** @jsxImportSource ../src */

import { describe, expect, it } from "vitest";
import {
  createOwnedEffect,
  getActiveOwnerContext,
  LifecycleScope,
  prependChild,
} from "@volynets/reflex-framework";
import { createApp, useSignal } from "../src";

describe("DOM event lifecycle ownership", () => {
  it("replaces a click-created effect and disposes it with the component", () => {
    const app = createApp();
    const container = document.createElement("div");
    const events: string[] = [];
    let setCount!: (value: number) => void;
    let active: LifecycleScope | null = null;
    let generation = 0;

    function View() {
      const count = useSignal(0);
      setCount = (value) => {
        app.renderer.batch(() => count(value));
      };
      const owner = getActiveOwnerContext()!;
      const componentNode = owner.currentNode!;

      return (
        <button
          type="button"
          onClick={() => {
            active?.dispose();
            const scope = new LifecycleScope();
            active = scope;
            const label = ++generation;
            prependChild(componentNode, scope.node);
            createOwnedEffect(owner, scope.node, () => {
              const value = count();
              events.push(`${label}:${value}`);
              return () => events.push(`${label}:cleanup:${value}`);
            });
          }}
        >
          start
        </button>
      );
    }

    const dispose = app.render(<View />, container);
    const button = container.querySelector("button")!;
    const click = () =>
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    click();
    setCount(1);
    app.renderer.flush();
    click();
    setCount(2);
    app.renderer.flush();
    dispose();
    setCount(3);
    app.renderer.flush();

    expect(active?.disposed).toBe(true);
    expect(events).toEqual([
      "1:0",
      "1:cleanup:0",
      "1:1",
      "1:cleanup:1",
      "2:1",
      "2:cleanup:1",
      "2:2",
      "2:cleanup:2",
    ]);
  });
});
