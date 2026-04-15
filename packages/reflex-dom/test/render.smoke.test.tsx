/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it } from "vitest";
import { computed, effect, memo, signal } from "@volynets/reflex";
import type { JSXRenderable } from "../src";
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
    render("hello" as JSXRenderable, container);
    expect(container.textContent).toBe("hello");
  });

  it("renders number as text", () => {
    const container = document.createElement("div");
    render(42 as JSXRenderable, container);
    expect(container.textContent).toBe("42");
  });

  it("renders null/undefined/boolean as nothing", () => {
    const container = document.createElement("div");
    for (const v of [null, undefined, true, false]) {
      render(v as JSXRenderable, container);
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
      [<b key="1">x</b>, <b key="2">y</b>] as JSXRenderable,
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
    render(<input placeholder={null as unknown as string} />, container);
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

  it("renders nested arrays with static, node, and reactive children", () => {
    const container = document.createElement("div");
    const [label, setLabel] = signal("live");
    const strong = document.createElement("strong");
    strong.textContent = "node";

    render(
      <div>{["a", [strong, () => label(), "z"]]}</div>,
      container,
    );

    expect(container.querySelector("div")?.textContent).toBe("anodelivez");
    setLabel("updated");
    expect(container.querySelector("div")?.textContent).toBe("anodeupdatedz");
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

  it("passes children into components", () => {
    const container = document.createElement("div");
    const Frame = ({ children }: { children?: JSXRenderable }) => (
      <section data-kind="frame">{children}</section>
    );

    render(
      <Frame>
        <span>inside</span>
      </Frame>,
      container,
    );

    expect(container.querySelector("section")?.getAttribute("data-kind")).toBe("frame");
    expect(container.querySelector("span")?.textContent).toBe("inside");
  });

  it("renders deeply nested components that forward children without remounting wrappers", () => {
    const container = document.createElement("div");
    const [name, setName] = signal("Alice");

    const Shell = ({ children }: { children?: JSXRenderable }) => (
      <section data-shell="true">{children}</section>
    );
    const Card = ({ title, children }: { title: string; children?: JSXRenderable }) => (
      <article>
        <h2>{title}</h2>
        <div class="card-body">{children}</div>
      </article>
    );
    const Row = ({ label, children }: { label: string; children?: JSXRenderable }) => (
      <p>
        <span>{label}</span>
        {children}
      </p>
    );

    render(
      <Shell>
        <Card title="Profile">
          <Row label="Name: ">{name}</Row>
        </Card>
      </Shell>,
      container,
    );

    const shell = container.querySelector("section");
    const card = container.querySelector("article");
    const row = container.querySelector("p");
    const label = container.querySelector("span");

    expect(shell?.getAttribute("data-shell")).toBe("true");
    expect(card?.querySelector("h2")?.textContent).toBe("Profile");
    expect(row?.textContent).toBe("Name: Alice");

    setName("Bob");

    expect(container.querySelector("section")).toBe(shell);
    expect(container.querySelector("article")).toBe(card);
    expect(container.querySelector("p")).toBe(row);
    expect(container.querySelector("span")).toBe(label);
    expect(row?.textContent).toBe("Name: Bob");
  });

  it("renders nested components with reactive children", () => {
    const container = document.createElement("div");
    const [name, setName] = signal("Alice");
    const Name = ({ value }: { value: () => string }) => <strong>{value}</strong>;
    const Greeting = ({ value }: { value: () => string }) => (
      <p>Hello, <Name value={value} /></p>
    );

    render(<Greeting value={name} />, container);
    expect(container.querySelector("p")?.textContent).toBe("Hello, Alice");

    setName("Bob");
    expect(container.querySelector("p")?.textContent).toBe("Hello, Bob");
  });

  it("renders a rich component with signal, computed, memo, and effect", () => {
    const container = document.createElement("div");
    const effectLog: string[] = [];

    function Dashboard() {
      const [count, setCount] = signal(1);
      const [label] = signal("alpha");
      const doubled = computed(() => count() * 2);
      const badge = memo(() => `badge:${label()}`);

      effect(() => {
        const snapshot = `${count()}->${doubled()}`;
        effectLog.push(`effect:${snapshot}`);
        return () => {
          effectLog.push(`cleanup:${snapshot}`);
        };
      });

      return (
        <section
          data-count={() => String(count())}
          class={() => (count() % 2 === 0 ? "even" : "odd")}
        >
          <h2>{() => `Dashboard ${label()}`}</h2>
          <p>{() => `count=${count()} doubled=${doubled()}`}</p>
          <output>{badge}</output>
          <strong>{() => (count() > 2 ? "hot" : "warm")}</strong>
          <button id="inc" type="button" onClick={() => setCount((value) => value + 1)}>
            increment
          </button>
        </section>
      );
    }

    const dispose = render(<Dashboard />, container);
    const section = container.querySelector("section");
    const text = () => section?.textContent?.replace(/\s+/g, " ").trim();

    expect(section?.getAttribute("data-count")).toBe("1");
    expect(section?.getAttribute("class")).toBe("odd");
    expect(text()).toContain("Dashboard alpha");
    expect(text()).toContain("count=1 doubled=2");
    expect(text()).toContain("badge:alpha");
    expect(text()).toContain("warm");
    expect(effectLog).toEqual(["effect:1->2"]);

    (container.querySelector("#inc") as HTMLButtonElement).click();
    expect(section?.getAttribute("data-count")).toBe("2");
    expect(section?.getAttribute("class")).toBe("even");
    expect(text()).toContain("count=2 doubled=4");
    expect(text()).toContain("badge:alpha");
    expect(effectLog[0]).toBe("effect:1->2");
    expect(effectLog).toContain("cleanup:1->2");
    expect(effectLog.at(-1)).toBe("effect:2->4");

    (container.querySelector("#inc") as HTMLButtonElement).click();
    expect(section?.getAttribute("data-count")).toBe("3");
    expect(text()).toContain("count=3 doubled=6");
    expect(text()).toContain("badge:alpha");
    expect(text()).toContain("hot");
    expect(effectLog).toContain("effect:2->4");
    expect(effectLog.at(-1)).toBe("effect:3->6");

    dispose();
    expect(container.innerHTML).toBe("");
    expect(effectLog).toContain("effect:3->6");
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
