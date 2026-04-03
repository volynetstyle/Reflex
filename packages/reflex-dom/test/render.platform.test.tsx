/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it } from "vitest";
import { signal } from "@volynets/reflex";
import { createDOMRuntime, render } from "../src";

describe("render platform integrations", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  it("renders into a ShadowRoot target", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });

    render(<span>shadow one</span>, root);
    expect(root.textContent).toBe("shadow one");

    render(<span>shadow two</span>, root);
    expect(root.textContent).toBe("shadow two");
    expect(root.querySelectorAll("span")).toHaveLength(1);
  });

  it("preserves foreign ShadowRoot nodes when a managed render is disposed", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    const preservedStyle = document.createElement("style");
    preservedStyle.textContent = ":host { display: block; }";
    root.appendChild(preservedStyle);

    const dispose = render(<span>managed</span>, root);

    expect(root.querySelector("style")).toBe(preservedStyle);
    expect(root.querySelector("span")?.textContent).toBe("managed");

    dispose();

    expect(root.querySelector("style")).toBe(preservedStyle);
    expect(root.querySelector("span")).toBeNull();
    expect(root.textContent).toContain("display: block");
  });

  it("supports custom elements with attached shadow content and adopted stylesheets", () => {
    if (!("adoptedStyleSheets" in ShadowRoot.prototype)) {
      Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", {
        configurable: true,
        writable: true,
        value: [],
      });
    }

    const tag = `x-reflex-${Math.random().toString(36).slice(2)}`;
    const Tag = tag as `${string}-${string}`;
    class ReflexElement extends HTMLElement {}
    customElements.define(tag, ReflexElement);

    const shadowRootRef = { current: null as ShadowRoot | null };
    const sheet = {} as CSSStyleSheet;
    const container = document.createElement("div");

    render(
      <Tag
        shadowRoot={{ mode: "open" }}
        shadowRootRef={shadowRootRef}
        shadowAdoptedStyleSheets={[sheet]}
        shadowChildren={<span>inside shadow</span>}
      >
        <span slot="label">light child</span>
      </Tag>,
      container,
    );

    const element = container.querySelector(tag) as HTMLElement | null;
    expect(element).not.toBeNull();
    expect(element?.shadowRoot?.textContent).toBe("inside shadow");
    expect(element?.querySelector('[slot="label"]')?.textContent).toBe("light child");
    expect(shadowRootRef.current).toBe(element?.shadowRoot ?? null);
    expect(shadowRootRef.current?.adoptedStyleSheets).toEqual([sheet]);
  });

  it("captures ElementInternals for custom elements when available", () => {
    const tag = `x-internals-${Math.random().toString(36).slice(2)}`;
    const Tag = tag as `${string}-${string}`;

    class InternalsElement extends HTMLElement {}

    Object.defineProperty(InternalsElement.prototype, "attachInternals", {
      configurable: true,
      value() {
        return { shadowRoot: null } as ElementInternals;
      },
    });

    customElements.define(tag, InternalsElement);

    const internalsRef = { current: null as ElementInternals | null };
    const container = document.createElement("div");

    render(<Tag elementInternals={internalsRef} />, container);

    expect(internalsRef.current).not.toBeNull();
    expect(internalsRef.current?.shadowRoot).toBeNull();
  });

  it("renders MathML with the correct namespace", () => {
    const container = document.createElement("div");

    render(
      <math display="block">
        <mrow>
          <mi>x</mi>
          <mo>+</mo>
          <mn>1</mn>
        </mrow>
      </math>,
      container,
    );

    const math = container.querySelector("math");
    const mi = container.querySelector("mi");

    expect(math?.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
    expect(mi?.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
    expect(container.textContent).toBe("x+1");
  });

  it("keeps controlled input value in sync without dropping caret position", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [value, setValue] = signal("abc");

    render(<input value={value} />, container);

    const input = container.querySelector("input") as HTMLInputElement;
    input.focus();
    input.setSelectionRange(1, 1);

    setValue("abcd");

    expect(input.value).toBe("abcd");
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(1);
  });

  it("defers controlled input writes while IME composition is active", () => {
    const container = document.createElement("div");
    const [value, setValue] = signal("alpha");

    render(<input value={value} />, container);

    const input = container.querySelector("input") as HTMLInputElement;
    input.value = "alph";
    input.dispatchEvent(new Event("compositionstart"));

    setValue("beta");
    expect(input.value).toBe("alph");

    input.dispatchEvent(new Event("compositionend"));
    expect(input.value).toBe("beta");
  });

  it("keeps textarea values controlled", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const [value, setValue] = signal("hello");

    render(<textarea value={value}>ignored</textarea>, container);

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");
    expect(textarea.textContent).toBe("");

    textarea.focus();
    textarea.setSelectionRange(2, 2);
    setValue("hello!");

    expect(textarea.value).toBe("hello!");
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(2);
  });

  it("keeps single and multiple select controls in sync", () => {
    const singleContainer = document.createElement("div");
    const multipleContainer = document.createElement("div");
    const [singleValue, setSingleValue] = signal("b");
    const [multipleValue, setMultipleValue] = signal(["a", "c"] as readonly string[]);

    render(
      <select value={singleValue}>
        <option value="a">A</option>
        <option value="b">B</option>
        <option value="c">C</option>
      </select>,
      singleContainer,
    );

    render(
      <select multiple value={multipleValue}>
        <option value="a">A</option>
        <option value="b">B</option>
        <option value="c">C</option>
      </select>,
      multipleContainer,
    );

    const single = singleContainer.querySelector("select") as HTMLSelectElement;
    const multiple = multipleContainer.querySelector("select") as HTMLSelectElement;

    expect(single.value).toBe("b");
    expect(Array.from(multiple.selectedOptions).map((option) => option.value)).toEqual(["a", "c"]);

    setSingleValue("a");
    setMultipleValue(["b"]);

    expect(single.value).toBe("a");
    expect(Array.from(multiple.selectedOptions).map((option) => option.value)).toEqual(["b"]);
  });
});
