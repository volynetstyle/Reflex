/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it } from "vitest";
import { signal } from "@volynetstyle/reflex";
import { createDOMRuntime, render, Fragment } from "../src";

describe("render", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  it("renders static markup", () => {
    const container = document.createElement("div");

    render(
      <section id="app-shell" data-ready="yes">
        <h1>Hello Reflex DOM</h1>
      </section>,
      container,
    );

    expect(container.querySelector("section")?.id).toBe("app-shell");
    expect(container.querySelector("section")?.getAttribute("data-ready")).toBe("yes");
    expect(container.querySelector("h1")?.textContent).toBe("Hello Reflex DOM");
  });

  it("updates accessor-driven text and attributes", () => {
    const container = document.createElement("div");
    const [count, setCount] = signal(0);

    const dispose = render(
      <button
        class={() => (count() === 0 ? "idle" : "active")}
        type="button"
        onClick={() => setCount((v) => v + 1)}
      >
        count: {count}
      </button>,
      container,
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe("count: 0");
    expect(button?.getAttribute("class")).toBe("idle");

    button?.click();
    expect(button?.textContent).toBe("count: 1");
    expect(button?.getAttribute("class")).toBe("active");

    dispose();
    expect(container.innerHTML).toBe("");
  });

  // --- Static rendering ---

  it("renders plain text node", () => {
    const container = document.createElement("div");
    render("hello" as any, container);
    expect(container.textContent).toBe("hello");
  });

  it("renders number as text", () => {
    const container = document.createElement("div");
    render(42 as any, container);
    expect(container.textContent).toBe("42");
  });

  it("renders null/undefined/boolean as nothing", () => {
    const container = document.createElement("div");
    for (const v of [null, undefined, true, false]) {
      render(v as any, container);
      expect(container.innerHTML).toBe("");
    }
  });

  it("renders nested elements", () => {
    const container = document.createElement("div");
    render(
      <ul>
        <li>a</li>
        <li>b</li>
        <li>c</li>
      </ul>,
      container,
    );
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect([...items].map((li) => li.textContent)).toEqual(["a", "b", "c"]);
  });

  it("renders Fragment with multiple children", () => {
    const container = document.createElement("div");
    render(
      <>
        <span>one</span>
        <span>two</span>
      </>,
      container,
    );
    expect(container.querySelectorAll("span")).toHaveLength(2);
    expect(container.textContent).toBe("onetwo");
  });

  it("renders array of elements", () => {
    const container = document.createElement("div");
    render(
      [<b key="1">x</b>, <b key="2">y</b>] as any,
      container,
    );
    expect(container.querySelectorAll("b")).toHaveLength(2);
  });

  // --- Props ---

  it("sets boolean attribute (disabled)", () => {
    const container = document.createElement("div");
    render(<button disabled>x</button>, container);
    expect(container.querySelector("button")?.disabled).toBe(true);
  });

  it("removes attribute when value is false", () => {
    const container = document.createElement("div");
    render(<button disabled={false}>x</button>, container);
    expect(container.querySelector("button")?.hasAttribute("disabled")).toBe(false);
  });

  it("removes attribute when value is null", () => {
    const container = document.createElement("div");
    render(<input placeholder={null as any} />, container);
    expect(container.querySelector("input")?.hasAttribute("placeholder")).toBe(false);
  });

  it("sets className via class prop", () => {
    const container = document.createElement("div");
    render(<p class="foo bar">text</p>, container);
    expect(container.querySelector("p")?.getAttribute("class")).toBe("foo bar");
  });

  it("applies inline style object", () => {
    const container = document.createElement("div");
    render(<div style={{ color: "red", fontSize: "16px" }} />, container);
    const el = container.querySelector("div") as HTMLDivElement;
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });

  it("applies inline style string", () => {
    const container = document.createElement("div");
    render(<div style="opacity:0.5" />, container);
    expect((container.querySelector("div") as HTMLDivElement).style.opacity).toBe("0.5");
  });

  it("sets data- attributes", () => {
    const container = document.createElement("div");
    render(<div data-foo="bar" />, container);
    expect(container.querySelector("div")?.getAttribute("data-foo")).toBe("bar");
  });

  it("sets aria- attributes", () => {
    const container = document.createElement("div");
    render(<div aria-label="close" />, container);
    expect(container.querySelector("div")?.getAttribute("aria-label")).toBe("close");
  });

  // --- Events ---

  it("fires onClick handler", () => {
    const container = document.createElement("div");
    let fired = false;
    render(<button onClick={() => { fired = true; }}>click</button>, container);
    container.querySelector("button")?.click();
    expect(fired).toBe(true);
  });

  it("removes event listener on dispose", () => {
    const container = document.createElement("div");
    let count = 0;
    const dispose = render(
      <button onClick={() => { count++; }}>x</button>,
      container,
    );
    container.querySelector("button")?.click();
    expect(count).toBe(1);
    dispose();
    // element is gone — no further clicks possible, listener cleaned up
    expect(container.innerHTML).toBe("");
  });

  // --- Reactivity ---

  it("updates text content reactively", () => {
    const container = document.createElement("div");
    const [name, setName] = signal("Alice");
    render(<p>{name}</p>, container);
    expect(container.querySelector("p")?.textContent).toBe("Alice");
    setName("Bob");
    expect(container.querySelector("p")?.textContent).toBe("Bob");
  });

  it("updates multiple reactive nodes independently", () => {
    const container = document.createElement("div");
    const [a, setA] = signal("x");
    const [b, setB] = signal("y");
    render(<p>{a} {b}</p>, container);
    setA("hello");
    expect(container.querySelector("p")?.textContent).toBe("hello y");
    setB("world");
    expect(container.querySelector("p")?.textContent).toBe("hello world");
  });

  it("conditionally renders child via accessor", () => {
    const container = document.createElement("div");
    const [show, setShow] = signal(true);
    render(<div>{() => show() ? <span>visible</span> : null}</div>, container);
    expect(container.querySelector("span")).not.toBeNull();
    setShow(false);
    expect(container.querySelector("span")).toBeNull();
    setShow(true);
    expect(container.querySelector("span")).not.toBeNull();
  });

  it("swaps element type reactively", () => {
    const container = document.createElement("div");
    const [big, setBig] = signal(false);
    render(<div>{() => big() ? <h1>big</h1> : <p>small</p>}</div>, container);
    expect(container.querySelector("p")).not.toBeNull();
    setBig(true);
    expect(container.querySelector("h1")).not.toBeNull();
    expect(container.querySelector("p")).toBeNull();
  });

  it("updates reactive style object", () => {
    const container = document.createElement("div");
    const [color, setColor] = signal("blue");
    render(<div style={() => ({ color: color() })} />, container);
    expect((container.querySelector("div") as HTMLDivElement).style.color).toBe("blue");
    setColor("green");
    expect((container.querySelector("div") as HTMLDivElement).style.color).toBe("green");
  });

  // --- Component ---

  it("renders functional component", () => {
    const container = document.createElement("div");
    const Greeting = ({ name }: { name: string }) => <p>Hi, {name}!</p>;
    render(<Greeting name="World" />, container);
    expect(container.querySelector("p")?.textContent).toBe("Hi, World!");
  });

  it("renders component returning Fragment", () => {
    const container = document.createElement("div");
    const Pair = () => <><i>a</i><i>b</i></>;
    render(<Pair />, container);
    expect(container.querySelectorAll("i")).toHaveLength(2);
  });

  it("renders component returning null", () => {
    const container = document.createElement("div");
    const Empty = () => null;
    render(<Empty />, container);
    expect(container.innerHTML).toBe("");
  });

  // --- SVG ---

  it("renders SVG element with correct namespace", () => {
    const container = document.createElement("div");
    render(
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" />
      </svg>,
      container,
    );
    const svg = container.querySelector("svg");
    expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(container.querySelector("circle")?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  // --- Lifecycle ---

  it("replaces previous render on second render call", () => {
    const container = document.createElement("div");
    render(<p>first</p>, container);
    expect(container.textContent).toBe("first");
    render(<p>second</p>, container);
    expect(container.textContent).toBe("second");
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("cleans up reactive effects on dispose", () => {
    const container = document.createElement("div");
    const [val, setVal] = signal("a");
    const dispose = render(<span>{val}</span>, container);
    dispose();
    setVal("b");
    // container is cleared and signal update has no effect
    expect(container.innerHTML).toBe("");
  });

  it("dispose is idempotent", () => {
    const container = document.createElement("div");
    const dispose = render(<div>x</div>, container);
    dispose();
    expect(() => dispose()).not.toThrow();
    expect(container.innerHTML).toBe("");
  });
});