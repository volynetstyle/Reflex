/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effect, memo, signal } from "@volynets/reflex";
import { createDOMRenderer, createDOMRuntime, render } from "../src";

describe("render lifecycle and reactive bindings", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  it("disposes component-scoped effects when a dynamic component unmounts", () => {
    const container = document.createElement("div");
    const [show, setShow] = signal(true);
    const [source, setSource] = signal("a");
    const log: string[] = [];

    function Child() {
      effect(() => {
        const value = source();
        log.push(`run:${value}`);

        return () => {
          log.push(`cleanup:${value}`);
        };
      });

      return <span>{source}</span>;
    }

    render(<div>{() => show() ? <Child /> : null}</div>, container);

    expect(log).toEqual(["run:a"]);

    setSource("b");
    expect(log).toEqual(["run:a", "cleanup:a", "run:b"]);

    setShow(false);
    expect(container.querySelector("span")).toBeNull();
    expect(log).toEqual(["run:a", "cleanup:a", "run:b", "cleanup:b"]);

    setSource("c");
    expect(log).toEqual(["run:a", "cleanup:a", "run:b", "cleanup:b"]);
  });

  it("disposes component-scoped effects when the root render is disposed", () => {
    const container = document.createElement("div");
    const [source, setSource] = signal("a");
    const log: string[] = [];

    function Child() {
      effect(() => {
        const value = source();
        log.push(`run:${value}`);

        return () => {
          log.push(`cleanup:${value}`);
        };
      });

      return <span>{source}</span>;
    }

    const dispose = render(<Child />, container);

    expect(log).toEqual(["run:a"]);

    dispose();

    expect(container.innerHTML).toBe("");
    expect(log).toEqual(["run:a", "cleanup:a"]);

    setSource("b");
    expect(log).toEqual(["run:a", "cleanup:a"]);
  });

  it("updates memo-backed text nodes and attributes outside components", () => {
    const container = document.createElement("div");
    const [count, setCount] = signal(1);
    const doubled = memo(() => String(count() * 2));

    render(<div data-doubled={doubled}>{doubled}</div>, container);

    const el = container.querySelector("div");
    expect(el?.textContent).toBe("2");
    expect(el?.getAttribute("data-doubled")).toBe("2");

    setCount(2);

    expect(el?.textContent).toBe("4");
    expect(el?.getAttribute("data-doubled")).toBe("4");
  });

  it("updates memo-backed bindings inside components when memo depends on computed", () => {
    const container = document.createElement("div");
    const [count, setCount] = signal(1);

    function Badge() {
      const doubled = computed(() => count() * 2);
      const label = memo(() => `value:${doubled()}`);

      return <output data-label={label}>{label}</output>;
    }

    render(<Badge />, container);

    const output = container.querySelector("output");
    expect(output?.textContent).toBe("value:2");
    expect(output?.getAttribute("data-label")).toBe("value:2");

    setCount(3);

    expect(output?.textContent).toBe("value:6");
    expect(output?.getAttribute("data-label")).toBe("value:6");
  });

  it("stops text and prop bindings after their range is removed", () => {
    const container = document.createElement("div");
    const [show, setShow] = signal(true);
    const [value, setValue] = signal("one");
    const textSpy = vi.fn(() => value());
    const attrSpy = vi.fn(() => value());

    render(
      <div>
        {() => show() ? <span data-value={attrSpy}>{textSpy}</span> : null}
      </div>,
      container,
    );

    expect(container.querySelector("span")?.textContent).toBe("one");
    expect(container.querySelector("span")?.getAttribute("data-value")).toBe("one");

    setValue("two");
    expect(container.querySelector("span")?.textContent).toBe("two");
    expect(container.querySelector("span")?.getAttribute("data-value")).toBe("two");

    setShow(false);
    expect(container.querySelector("span")).toBeNull();

    const textCallsAfterUnmount = textSpy.mock.calls.length;
    const attrCallsAfterUnmount = attrSpy.mock.calls.length;

    setValue("three");

    expect(textSpy).toHaveBeenCalledTimes(textCallsAfterUnmount);
    expect(attrSpy).toHaveBeenCalledTimes(attrCallsAfterUnmount);
  });

  it("disposes nested component scopes once in inside-out order", () => {
    const container = document.createElement("div");
    const [show, setShow] = signal(true);
    const log: string[] = [];

    function Inner() {
      effect(() => () => {
        log.push("inner");
      });

      return <span>inner</span>;
    }

    function Outer() {
      effect(() => () => {
        log.push("outer");
      });

      return (
        <div>
          <Inner />
        </div>
      );
    }

    const dispose = render(<section>{() => show() ? <Outer /> : null}</section>, container);

    setShow(false);
    expect(log).toEqual(["inner", "outer"]);

    dispose();
    expect(log).toEqual(["inner", "outer"]);
  });

  it("cleans up the previous tree when another renderer mounts into the same container", () => {
    const container = document.createElement("div");
    const [source, setSource] = signal("a");
    const log: string[] = [];

    function Child() {
      effect(() => {
        const value = source();
        log.push(`run:${value}`);

        return () => {
          log.push(`cleanup:${value}`);
        };
      });

      return <span>{source}</span>;
    }

    const firstRenderer = createDOMRenderer();
    const secondRenderer = createDOMRenderer();

    firstRenderer.render(<Child />, container);
    expect(log).toEqual(["run:a"]);

    secondRenderer.render(<p>next</p>, container);
    expect(container.textContent).toBe("next");
    expect(log).toEqual(["run:a", "cleanup:a"]);

    setSource("b");
    expect(log).toEqual(["run:a", "cleanup:a"]);
  });
});
