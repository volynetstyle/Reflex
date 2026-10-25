/** @jsxImportSource ../src */

import { beforeEach, describe, expect, it } from "vitest";
import { signal } from "./reactivity";
import { createDOMRuntime, hydrate, render, renderToString } from "../src";

/** Renders `view` on the client and returns the first element it created. */
function mount(view: unknown): Element {
  const container = document.createElement("div");
  render(view as never, container);
  return container.firstElementChild!;
}

/** Parses `renderToString(view)` and returns the first element. */
function serverElement(view: unknown): Element {
  const container = document.createElement("div");
  container.innerHTML = renderToString(view as never);
  return container.firstElementChild!;
}

describe("client and server agree on attributes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    createDOMRuntime();
  });

  describe("read-only reflected properties are written as attributes", () => {
    it.each([
      ["input", "list", "options"],
      ["input", "form", "signup"],
      ["button", "form", "signup"],
    ] as const)("<%s %s>", (tag, name, value) => {
      const element = mount(
        tag === "input" ? (
          <input {...({ [name]: value } as object)} />
        ) : (
          <button {...({ [name]: value } as object)} />
        ),
      );

      expect(element.getAttribute(name)).toBe(value);
    });

    it("updates and removes a read-only reflected attribute reactively", () => {
      const [form, setForm] = signal<string | null>("a");
      const element = mount(<button form={form} />);

      expect(element.getAttribute("form")).toBe("a");
      setForm("b");
      expect(element.getAttribute("form")).toBe("b");
      setForm(null);
      expect(element.hasAttribute("form")).toBe(false);
    });
  });

  describe("numeric reflected properties keep non-numeric strings", () => {
    it.each([
      ["img", "width", "50%"],
      ["img", "height", "2em"],
      ["canvas", "width", "50%"],
      ["video", "height", "50%"],
      ["input", "width", "50%"],
    ] as const)("<%s %s=%s>", (tag, name, value) => {
      const element = mount(
        tag === "img" ? (
          <img {...({ [name]: value } as object)} />
        ) : tag === "canvas" ? (
          <canvas {...({ [name]: value } as object)} />
        ) : tag === "video" ? (
          <video {...({ [name]: value } as object)} />
        ) : (
          <input {...({ [name]: value } as object)} />
        ),
      );

      expect(element.getAttribute(name)).toBe(value);
    });

    it("still writes numbers and numeric strings", () => {
      expect(mount(<img width={40} />).getAttribute("width")).toBe("40");
      expect(
        mount(<img {...({ width: "40" } as object)} />).getAttribute("width"),
      ).toBe("40");
      expect(mount(<div tabIndex={-1} />).getAttribute("tabindex")).toBe("-1");
    });
  });

  describe("boolean and enumerated attributes", () => {
    it("serializes aria booleans as the strings true and false", () => {
      const client = mount(<div aria-expanded={true} aria-hidden={false} />);
      const server = serverElement(
        <div aria-expanded={true} aria-hidden={false} />,
      );

      for (const element of [client, server]) {
        expect(element.getAttribute("aria-expanded")).toBe("true");
        expect(element.getAttribute("aria-hidden")).toBe("false");
      }
    });

    it("writes draggable and spellcheck the same on client and server", () => {
      const view = <div draggable={true} spellcheck={false} />;

      for (const element of [mount(view), serverElement(view)]) {
        expect(element.getAttribute("draggable")).toBe("true");
        expect(element.getAttribute("spellcheck")).toBe("false");
      }
    });

    it("writes download={true} as an empty attribute", () => {
      const view = <a href="/file.pdf" download={true} />;

      for (const element of [mount(view), serverElement(view)]) {
        expect(element.getAttribute("download")).toBe("");
      }
    });

    it("keeps download file names", () => {
      const view = <a href="/file.pdf" download="report.pdf" />;

      for (const element of [mount(view), serverElement(view)]) {
        expect(element.getAttribute("download")).toBe("report.pdf");
      }
    });

    it("keeps hidden=until-found", () => {
      const view = <div hidden="until-found" />;

      for (const element of [mount(view), serverElement(view)]) {
        expect(element.getAttribute("hidden")).toBe("until-found");
      }
    });

    it("toggles hidden between true, until-found and false", () => {
      const [hidden, setHidden] = signal<boolean | "until-found">(true);
      const element = mount(<div hidden={hidden} />);

      expect(element.getAttribute("hidden")).toBe("");
      setHidden("until-found");
      expect(element.getAttribute("hidden")).toBe("until-found");
      setHidden(false);
      expect(element.hasAttribute("hidden")).toBe(false);
    });
  });

  describe("form defaults", () => {
    it("serializes defaultValue and defaultChecked as value and checked", () => {
      const html = renderToString(
        <input type="checkbox" defaultValue="x" defaultChecked={true} />,
      );

      expect(html).toContain('value="x"');
      expect(html).toMatch(/ checked(?:[ >]|$)/);
      expect(html).not.toMatch(/default/i);
    });
  });

  describe("innerHTML and textContent", () => {
    it("serializes innerHTML as content, like the client", () => {
      const view = <div {...({ innerHTML: "<b>bold</b>" } as object)} />;

      for (const element of [mount(view), serverElement(view)]) {
        expect(element.innerHTML).toBe("<b>bold</b>");
        expect(element.hasAttribute("innerhtml")).toBe(false);
      }
    });

    it("serializes textContent as escaped content, like the client", () => {
      const view = <div {...({ textContent: "<b>" } as object)} />;

      for (const element of [mount(view), serverElement(view)]) {
        expect(element.textContent).toBe("<b>");
        expect(element.hasAttribute("textcontent")).toBe(false);
      }
    });

    it("appends children to the content, except a scalar child, which replaces it", () => {
      const content = { innerHTML: "<b>bold</b>" } as object;
      const appended = <div {...content}>{["tail"]}</div>;
      const replaced = <div {...content}>tail</div>;

      for (const element of [mount(appended), serverElement(appended)]) {
        expect(element.innerHTML).toBe("<b>bold</b>tail");
      }

      for (const element of [mount(replaced), serverElement(replaced)]) {
        expect(element.innerHTML).toBe("tail");
      }
    });

    it("hydrates innerHTML content without rebuilding the element", () => {
      const view = (
        <section>
          <div {...({ innerHTML: "<b>bold</b>" } as object)} />
        </section>
      );
      const container = document.createElement("div");
      container.innerHTML = renderToString(view);
      const serverDiv = container.querySelector("div");

      hydrate(view, container);

      expect(container.querySelector("div")).toBe(serverDiv);
      expect(serverDiv?.innerHTML).toBe("<b>bold</b>");
    });
  });

  describe("raw text elements", () => {
    it("serializes style and script content without escaping", () => {
      const html = renderToString(
        <div>
          <style>{"a>b{color:red}"}</style>
          <script>{"if (a < b && c > d) run('&amp;')"}</script>
        </div>,
      );

      expect(html).toContain("<style>a>b{color:red}</style>");
      expect(html).toContain("<script>if (a < b && c > d) run('&amp;')</script>");
    });

    it("cannot be closed early by their content", () => {
      const container = document.createElement("div");
      container.innerHTML = renderToString(
        <div>
          <style>{"a::after{content:'</style><p id=s>'}"}</style>
          <script>{"x = '</SCRIPT><p id=j>'; y = '<!--<script>'"}</script>
        </div>,
      );

      expect(container.querySelector("#s")).toBeNull();
      expect(container.querySelector("#j")).toBeNull();
      expect(container.querySelectorAll("style, script")).toHaveLength(2);
    });

    it("serializes dynamic text content without hydration markers", () => {
      const [color] = signal("red");
      const html = renderToString(
        <style>
          {"a{color:"}
          {color}
          {"}"}
        </style>,
      );

      expect(html).toBe("<style>a{color:red}</style>");
    });

    it("escapes text in SVG style, which is not a raw text element", () => {
      expect(renderToString(<svg><style>{"a>b{}"}</style></svg>)).toContain(
        "<style>a&gt;b{}</style>",
      );
    });

    it("hydrates text-only elements and keeps them reactive", () => {
      const [color, setColor] = signal("red");
      const [title, setTitle] = signal("one");
      const view = (
        <div>
          <title>{title}</title>
          <style>
            {"a{color:"}
            {color}
            {"}"}
          </style>
        </div>
      );
      const container = document.createElement("div");
      container.innerHTML = renderToString(view);
      const serverStyle = container.querySelector("style");
      const serverTitle = container.querySelector("title");

      hydrate(view, container);

      expect(container.querySelector("style")).toBe(serverStyle);
      expect(container.querySelector("title")).toBe(serverTitle);
      expect(serverStyle?.textContent).toBe("a{color:red}");
      expect(serverTitle?.textContent).toBe("one");

      setColor("blue");
      setTitle("two");

      expect(serverStyle?.textContent).toBe("a{color:blue}");
      expect(serverTitle?.textContent).toBe("two");
    });
  });

  describe("styles", () => {
    it("serializes vendor-prefixed style keys with a leading dash", () => {
      const html = renderToString(
        <div
          style={
            {
              msTransform: "none",
              webkitLineClamp: 2,
              MozAppearance: "none",
            } as object
          }
        />,
      );

      expect(html).toContain("-ms-transform:none");
      expect(html).toContain("-webkit-line-clamp:2");
      expect(html).toContain("-moz-appearance:none");
    });
  });

  describe("SVG presentation attributes", () => {
    it("accepts camelCase spellings on client and server", () => {
      const view = (
        <svg>
          <text
            clipPath="url(#c)"
            fontSize={12}
            fontFamily="serif"
            pointerEvents="none"
            colorInterpolationFilters="sRGB"
          />
        </svg>
      );

      for (const element of [mount(view), serverElement(view)]) {
        const text = element.querySelector("text")!;
        expect(text.getAttribute("clip-path")).toBe("url(#c)");
        expect(text.getAttribute("font-size")).toBe("12");
        expect(text.getAttribute("font-family")).toBe("serif");
        expect(text.getAttribute("pointer-events")).toBe("none");
        expect(text.getAttribute("color-interpolation-filters")).toBe("sRGB");
      }
    });
  });
});
