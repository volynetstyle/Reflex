/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { signal } from "./reactivity";
import {
  Portal,
  createDOMRuntime,
  hydrate,
  render,
  renderToString,
} from "../src";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

describe("specification conformance", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  describe("namespaces follow the HTML parser", () => {
    it("creates tags shared by HTML and SVG as HTML in an HTML context", () => {
      const container = document.createElement("div");

      render(
        <div>
          <a href="/docs">docs</a>
          <style>{"a { color: red }"}</style>
          <title>title</title>
        </div>,
        container,
      );

      for (const tag of ["a", "style", "title"]) {
        expect(container.querySelector(tag)?.namespaceURI).toBe(HTML_NS);
      }
      expect(container.querySelector("a")).toBeInstanceOf(HTMLAnchorElement);
    });

    it("keeps shared tags in SVG inside <svg>", () => {
      const container = document.createElement("div");

      render(
        <svg>
          <a href="#target">
            <title>tooltip</title>
          </a>
        </svg>,
        container,
      );

      expect(container.querySelector("a")?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector("title")?.namespaceURI).toBe(SVG_NS);
    });

    it("switches children of HTML integration points back to HTML", () => {
      const container = document.createElement("div");

      render(
        <div>
          <svg>
            <foreignObject>
              <div class="html" />
              <svg>
                <circle />
              </svg>
            </foreignObject>
          </svg>
          <math>
            <mtext>
              <span class="text" />
            </mtext>
            <mi>x</mi>
          </math>
        </div>,
        container,
      );

      expect(container.querySelector(".html")?.namespaceURI).toBe(HTML_NS);
      expect(container.querySelector("circle")?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector(".text")?.namespaceURI).toBe(HTML_NS);
      expect(container.querySelector("mi")?.namespaceURI).toBe(MATHML_NS);
    });

    it("takes the root namespace from SVG containers and portal targets", () => {
      const svgContainer = document.createElementNS(SVG_NS, "svg");
      render(<a href="#x" />, svgContainer);
      expect(svgContainer.firstElementChild?.namespaceURI).toBe(SVG_NS);

      const portalTarget = document.createElementNS(SVG_NS, "g");
      const container = document.createElement("div");
      render(
        <Portal to={portalTarget}>
          <a href="#y" />
        </Portal>,
        container,
      );
      expect(portalTarget.querySelector("a")?.namespaceURI).toBe(SVG_NS);
    });

    it("hydrates server-rendered links without a mismatch", () => {
      const container = document.createElement("div");
      const view = (
        <nav>
          <a href="/home">home</a>
        </nav>
      );

      container.innerHTML = renderToString(view);
      const link = container.querySelector("a");

      hydrate(view, container);

      expect(container.querySelector("a")).toBe(link);
      expect(link?.namespaceURI).toBe(HTML_NS);
    });
  });

  describe("event listeners", () => {
    it("forwards window events declared on <body> to its Window", () => {
      const container = document.createElement("div");
      const onHashChange = vi.fn();
      const onClick = vi.fn();

      const dispose = render(
        <body
          onHashChange={function (event) {
            onHashChange(
              Object.prototype.toString.call(event.currentTarget),
              this === event.currentTarget,
            );
          }}
          onClick={onClick}
        />,
        container,
      );

      document.defaultView!.dispatchEvent(new Event("hashchange"));
      // vitest exposes jsdom's Window through a different global object, so
      // check the listener target by brand rather than identity.
      expect(onHashChange).toHaveBeenCalledWith("[object Window]", true);

      container.querySelector("body")!.dispatchEvent(new Event("click"));
      expect(onClick).toHaveBeenCalledTimes(1);

      dispose();
      document.defaultView!.dispatchEvent(new Event("hashchange"));
      expect(onHashChange).toHaveBeenCalledTimes(1);
    });

    it("does not forward window events from other elements", () => {
      const container = document.createElement("div");
      const onHashChange = vi.fn();

      render(<div on:hashchange={onHashChange} />, container);
      document.defaultView!.dispatchEvent(new Event("hashchange"));

      expect(onHashChange).not.toHaveBeenCalled();
    });

    it("treats lowercase on* props as events only for native handlers", () => {
      const container = document.createElement("div");
      const [label, setLabel] = signal("first");
      const onClick = vi.fn();

      render(
        <div>
          <x-onboarding onboarding={() => label()} />
          <button onclick={onClick} />
        </div>,
        container,
      );

      const custom = container.querySelector("x-onboarding")!;
      expect(custom.getAttribute("onboarding")).toBe("first");
      setLabel("second");
      expect(custom.getAttribute("onboarding")).toBe("second");

      container.querySelector("button")!.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("ARIA true/false states", () => {
    it("serializes booleans as tokens on the client and the server", () => {
      const container = document.createElement("div");
      const [expanded, setExpanded] = signal(false);
      const view = (
        <button aria-expanded={() => expanded()} aria-hidden={true} />
      );

      render(view, container);
      const button = container.querySelector("button")!;

      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(button.getAttribute("aria-hidden")).toBe("true");
      setExpanded(true);
      expect(button.getAttribute("aria-expanded")).toBe("true");

      expect(renderToString(<button aria-expanded={false} aria-hidden />)).toBe(
        '<button aria-expanded="false" aria-hidden="true"></button>',
      );
      expect(renderToString(<button aria-expanded={null} />)).toBe(
        "<button></button>",
      );
    });
  });

  describe("server serialization matches the client DOM", () => {
    it("writes reflected default props as their content attributes", () => {
      expect(renderToString(<input defaultValue="a" defaultChecked />)).toBe(
        '<input value="a" checked>',
      );
      expect(renderToString(<input value="b" defaultValue="a" />)).toBe(
        '<input value="b">',
      );
      expect(renderToString(<option defaultSelected>x</option>)).toBe(
        "<option selected>x</option>",
      );
    });

    it("writes enumerated boolean properties as keywords", () => {
      expect(
        renderToString(
          <div translate={false} draggable={false} spellcheck={true} />,
        ),
      ).toBe('<div translate="no" draggable="false" spellcheck="true"></div>');
    });

    it("omits properties without a content attribute", () => {
      expect(
        renderToString(<input type="checkbox" indeterminate={true} />),
      ).toBe('<input type="checkbox">');
    });

    it("converts webkit-cased and cssFloat style keys", () => {
      const style = {
        cssFloat: "left",
        webkitLineClamp: 2,
        "-webkit-box-orient": "vertical",
        backgroundColor: "red",
      } as const;

      expect(renderToString(<div style={style} />)).toBe(
        '<div style="float:left;-webkit-line-clamp:2;-webkit-box-orient:vertical;background-color:red"></div>',
      );
    });

    it("marks the selected options of a controlled <select>", () => {
      expect(
        renderToString(
          <select value="b">
            <option value="a">A</option>
            <option value="b">B</option>
            <option>b</option>
          </select>,
        ),
      ).toBe(
        '<select><option value="a">A</option><option value="b" selected>B</option><option>b</option></select>',
      );

      expect(
        renderToString(
          <select multiple value={["a", "c"]}>
            <option value="a">A</option>
            <option value="b">B</option>
            <optgroup label="more">
              <option> c </option>
            </optgroup>
          </select>,
        ),
      ).toBe(
        '<select multiple><option value="a" selected>A</option><option value="b">B</option><optgroup label="more"><option selected> c </option></optgroup></select>',
      );
    });
  });
});
