import { describe, expect, it } from "vitest";
import { jsx } from "@volynets/reflex-dom/jsx-runtime";
import { signal } from "../../reflex-dom/test/reactivity";
import { evaluate } from "./harness/dom";
import type { CompileHoles } from "./holes.reactive.shared";

const IMPORTS = `import { jsx, jsxs } from "@volynets/reflex-dom/jsx-runtime";
import { For, Show, Switch, Portal, render, hydrate, renderToString } from "@volynets/reflex-dom";\n`;
const ENTRY = `
export const mount = (container, p) => render(jsx(App, p), container);
export const ssr = p => renderToString(jsx(App, p));
export const hydrateInto = (container, p) => hydrate(jsx(App, p), container);`;
const CONTROL =
  IMPORTS +
  `function App(p) { return jsxs("section", { ref: p.ref, children: [
    jsx(Show, { when: p.visible, children: () => jsx("b", { ref: p.ref, children: "shown" }), fallback: jsx("i", { children: "hidden" }) }),
    jsx(Switch, { value: p.mode, cases: [
      { when: 1, children: () => jsx("span", { ref: p.ref, children: "one" }) },
      { when: 2, children: () => jsx("u", { children: "two" }) }
    ], fallback: jsx("em", { children: "other" }) }),
    jsx(Portal, { to: p.target, children: () => jsx("strong", { ref: p.ref, children: "portal" }) })
  ] }); }` +
  ENTRY;

export const ORDERED_SOURCES = {
  rows:
    IMPORTS +
    `function App(p) { return jsx("table", { children: jsx("tbody", { children:
    jsx(For, { each: p.rows, by: x => x.id, children: item => jsxs("tr", {
      class: () => p.selected() === item().id ? "danger" : null,
      ref: p.ref("tr"), children: [
        jsx("td", { children: () => p.read(item().id) }),
        jsx("td", { children: jsx("a", { href: p.href, onClick: event => { event.preventDefault(); p.click(item().id); }, style: p.style, children: () => item().label }) }),
        jsx("td", { children: [p.left, p.right] })
      ] }) }) }) }); }` +
    ENTRY,
  order:
    IMPORTS +
    `function App(p) { return jsxs("div", {
    ref: p.ref, class: p.className, children: [p.first, jsx("span", { ref: p.childRef, children: "static" }), p.second]
  }); }` +
    ENTRY,
  scalar:
    IMPORTS +
    `function App(p) { return jsx("div", { ref: p.ref, children: p.value }); }` +
    ENTRY,
  failed:
    IMPORTS +
    `function App(p) { return jsx("div", { children: [
    jsx("a", { onClick: p.click, ref: p.ref, children: "click" }), p.fail
  ] }); }` +
    ENTRY,
  expressions:
    IMPORTS +
    `function App(p) { return jsxs("div", {
    children: [jsx("span", { title: p.mark("nested-prop", "title"), children: p.mark("nested-child", "body") }), p.mark("outer-child", "tail")],
    id: p.mark("late-prop", "id"), ref: p.mark("ref-expression", p.ref)
  }); }` +
    ENTRY,
  literalScalars:
    IMPORTS +
    `function App(p) { return jsxs("section", { children: [
    jsx("div", { ref: p.ref, children: "" }), jsx("div", { ref: p.ref, children: [""] }),
    jsx("div", { ref: p.ref, children: "text" }), jsx("div", { ref: p.ref, children: ["text"] })
  ] }); }` +
    ENTRY,
  platform:
    IMPORTS +
    `function App(p) { return jsx("div", { ref: p.rootRef, children:
    jsx("section", { shadowRoot: { mode: "open" }, ref: p.ref,
      children: jsx("i", { children: "light" }), shadowChildren: jsx("b", { children: "shadow" }) })
  }); }` +
    ENTRY,
  inspection:
    IMPORTS +
    `function App(p) { return jsx("section", { ref: p.ref, children:
    jsx("div", { get title() { p.mark(this.children.tag); return this.children.tag; }, children: jsx("b", { children: "raw" }) })
  }); }` +
    ENTRY,
  selfInspection:
    IMPORTS +
    `function App(p) { let nested = false; return jsx("section", { ref: p.ref, children:
    function content() { if (!nested) { nested = true; p.mark(content().tag); } return jsx("b", { children: "raw" }); }
  }); }` +
    ENTRY,
  control: CONTROL,
  controlLiteral: CONTROL.replaceAll("children: () => jsx", "children: jsx"),
};

type Props = Record<string, unknown>;
type Entry = {
  mount(container: Element, props: Props): () => void;
  ssr(props: Props): string;
  hydrateInto(container: Element, props: Props): () => void;
};

export function orderedSuite(compile: CompileHoles, label: string): void {
  const load = (
    source: string,
    variant: "baseline" | "native" | "template",
  ): Entry => {
    const result = compile(source, variant);
    if (variant !== "baseline")
      expect(
        result.report!.regions.some(
          (r) => r.strategy === "native" && (r.bindings ?? 0) > 0,
        ),
      ).toBe(true);
    return evaluate(result.body) as unknown as Entry;
  };

  describe(`ordered native regions (${label})`, () => {
    it.each([
      ["native", "control"],
      ["template", "control"],
      ["native", "controlLiteral"],
      ["template", "controlLiteral"],
    ] as const)(
      "%s / %s: Show/Switch/Portal branches preserve lifecycle and target namespaces",
      (variant, source) => {
        const run = (mode: "baseline" | "native" | "template") => {
          const entry = load(ORDERED_SOURCES[source], mode);
          const trace: unknown[] = [];
          const container = document.createElement("div");
          const html = document.createElement("div");
          const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          document.body.append(container, html, svg);
          const [visible, show] = signal(false),
            [value, select] = signal(1);
          const [target, move] = signal<Element | null>(html);
          const dispose = entry.mount(container, {
            visible,
            mode: value,
            target,
            ref: (el: Element | null) => {
              trace.push(["ref", el?.tagName ?? null]);
              if (el) return () => trace.push(["cleanup", el.tagName]);
            },
          });
          const record = () =>
            trace.push([container.innerHTML, html.innerHTML, svg.innerHTML]);
          record();
          show(true);
          record();
          select(2);
          record();
          move(svg);
          record();
          move(null);
          record();
          show(false);
          select(3);
          record();
          move(html);
          record();
          dispose();
          record();
          container.remove();
          html.remove();
          svg.remove();
          return trace;
        };
        expect(run(variant)).toEqual(run("baseline"));
      },
    );
    it.each(["inspection", "selfInspection"] as const)(
      "keeps descriptors observable through %s",
      (source) => {
        const run = (variant: "baseline" | "native" | "template") => {
          const trace: unknown[] = [];
          const container = document.createElement("div");
          const dispose = load(ORDERED_SOURCES[source], variant).mount(
            container,
            {
              ref: () => {},
              mark: (value: unknown) => trace.push(value),
            },
          );
          trace.push(container.innerHTML);
          dispose();
          return trace;
        };
        expect(run("native")).toEqual(run("baseline"));
        expect(run("template")).toEqual(run("baseline"));
      },
    );
    it("captures prop/child expressions exactly once in source evaluation order", () => {
      const run = (variant: "baseline" | "native" | "template") => {
        const trace: unknown[] = [];
        const container = document.createElement("div");
        const dispose = load(ORDERED_SOURCES.expressions, variant).mount(
          container,
          {
            mark: (name: string, value: unknown) => {
              trace.push(name);
              return value;
            },
            ref: (el: Element | null) =>
              trace.push([
                "ref",
                el?.id ?? null,
                el?.childNodes.length ?? null,
              ]),
          },
        );
        trace.push(container.innerHTML);
        dispose();
        return trace;
      };
      const baseline = run("baseline");
      expect(baseline.slice(0, 5)).toEqual([
        "nested-prop",
        "nested-child",
        "outer-child",
        "late-prop",
        "ref-expression",
      ]);
      expect(run("native")).toEqual(baseline);
      expect(run("template")).toEqual(baseline);
    });

    it("preserves literal scalar versus array text after a ref mutates the element", () => {
      const run = (variant: "baseline" | "native" | "template") => {
        const container = document.createElement("div");
        const dispose = load(ORDERED_SOURCES.literalScalars, variant).mount(
          container,
          {
            ref: (el: Element | null) => el?.append("ref"),
          },
        );
        const html = container.innerHTML;
        dispose();
        return html;
      };
      expect(run("baseline")).toBe(
        "<section><div></div><div>ref</div><div>text</div><div>reftext</div></section>",
      );
      expect(run("native")).toBe(run("baseline"));
      expect(run("template")).toBe(run("baseline"));
    });

    it("declines before creating nodes when the renderer lacks the ordered capability", () => {
      const { body } = compile(ORDERED_SOURCES.scalar, "native");
      const generated = evaluate(body + "\n__exports.create = _create;")
        .create as (...args: unknown[]) => unknown;
      const doc = {
        createElement: () => {
          throw new Error("unexpected DOM work");
        },
      };
      expect(generated(doc, null, [], undefined)).toBeNull();
      expect(generated(doc, null, [], { version: 0 })).toBeNull();
      expect(generated(doc, null, [], { version: 1 })).toBeNull();
    });

    it("leaves platform-managed content opaque while compiling its parent", () => {
      const run = (variant: "baseline" | "native" | "template") => {
        const trace: unknown[] = [];
        const container = document.createElement("div");
        const dispose = load(ORDERED_SOURCES.platform, variant).mount(
          container,
          {
            rootRef: () => {},
            ref: (el: Element | null) =>
              trace.push(el?.shadowRoot?.innerHTML ?? null),
          },
        );
        trace.push(
          container.innerHTML,
          container.querySelector("section")!.shadowRoot!.innerHTML,
        );
        dispose();
        return trace;
      };
      expect(run("native")).toEqual(run("baseline"));
      expect(run("template")).toEqual(run("baseline"));
    });
    const rowTrace = (variant: "baseline" | "native" | "template") => {
      const entry = load(ORDERED_SOURCES.rows, variant);
      const [rows, setRows] = signal([
        { id: 1, label: "one" },
        { id: 2, label: "two" },
      ]);
      const [selected, setSelected] = signal(0);
      const [left, setLeft] = signal<unknown>("L");
      const [right, setRight] = signal<unknown>("R");
      const [style, setStyle] = signal({ color: "red" });
      const [href, setHref] = signal("/safe");
      const trace: unknown[] = [];
      let reads = 0;
      const container = document.createElement("div");
      document.body.appendChild(container);
      const props = {
        rows,
        selected,
        left,
        right,
        style,
        href,
        read: (id: number) => {
          reads++;
          return id;
        },
        ref: (tag: string) => (el: Element | null) => {
          trace.push([tag, el?.childNodes.length ?? null]);
        },
        click: (id: number) => {
          trace.push(["click", id]);
          setSelected(id);
        },
      };
      const dispose = entry.mount(container, props);
      const first = container.querySelector("tr")!;
      const anchor = first.querySelector("a")!;
      const record = () => trace.push(container.innerHTML);
      record();
      anchor.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      record();
      setRows([
        { id: 2, label: "TWO" },
        { id: 1, label: "ONE" },
      ]);
      trace.push(["identity", container.querySelectorAll("tr")[1] === first]);
      record();
      setLeft(jsx("b", { children: "structural" }));
      setRight(null);
      setStyle({ color: "blue" });
      setHref("javascript:blocked");
      record();
      setRows([{ id: 2, label: "last" }]);
      const detachedClick = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      detachedClick.preventDefault();
      anchor.dispatchEvent(detachedClick);
      record();
      dispose();
      const stopped = reads;
      setRows([{ id: 3, label: "disposed" }]);
      setSelected(3);
      setLeft("disposed");
      trace.push(["stopped", reads === stopped, container.innerHTML]);
      container.remove();
      return trace;
    };

    it.each(["native", "template"] as const)(
      "%s: full keyed rows preserve updates, identity, events and cleanup",
      (variant) => {
        expect(rowTrace(variant)).toEqual(rowTrace("baseline"));
      },
    );

    const orderTrace = (variant: "baseline" | "native" | "template") => {
      const entry = load(ORDERED_SOURCES.order, variant);
      const trace: unknown[] = [];
      let root: Element;
      let observer: MutationObserver;
      const container = document.createElement("div");
      document.body.appendChild(container);
      const props = {
        ref: (el: Element | null) => {
          if (el === null) {
            trace.push("root-null");
            return;
          }
          root = el;
          trace.push(["root-ref", el.className, el.innerHTML]);
          el.append("ref");
          observer = new MutationObserver(() => {});
          observer.observe(el, {
            attributes: true,
            childList: true,
            subtree: true,
          });
        },
        className: () => {
          trace.push(["class-read", root.innerHTML]);
          return "ordered";
        },
        first: () => {
          trace.push(["first", root.innerHTML]);
          return jsx("b", { children: "first" });
        },
        childRef: (el: Element | null) =>
          trace.push(["child-ref", el === null ? null : root.innerHTML]),
        second: () => {
          trace.push(["second", root.innerHTML]);
          return "last";
        },
      };
      const dispose = entry.mount(container, props);
      trace.push(["html", container.innerHTML]);
      trace.push(
        observer!
          .takeRecords()
          .map((r) => [
            r.type,
            r.target.nodeName,
            r.attributeName,
            Array.from(r.addedNodes, (n) => n.nodeName),
            Array.from(r.removedNodes, (n) => n.nodeName),
          ]),
      );
      observer!.disconnect();
      dispose();
      container.remove();
      return trace;
    };
    it.each(["native", "template"] as const)(
      "%s: refs and accessors observe exactly the source mount order",
      (variant) => {
        expect(orderTrace(variant)).toEqual(orderTrace("baseline"));
      },
    );

    it.each(["", "text", [""], ["text"], null, false])(
      "preserves scalar/array children when a ref adds nodes: %j",
      (value) => {
        const run = (variant: "baseline" | "native" | "template") => {
          const container = document.createElement("div");
          const dispose = load(ORDERED_SOURCES.scalar, variant).mount(
            container,
            { value, ref: (el: Element | null) => el?.append("ref") },
          );
          const result = container.innerHTML;
          dispose();
          return result;
        };
        expect(run("native")).toBe(run("baseline"));
        expect(run("template")).toBe(run("baseline"));
      },
    );

    it.each(["native", "template"] as const)(
      "%s: SSR and hydration use the captured source values",
      (variant) => {
        const props = {
          ref: () => {},
          className: () => "ssr",
          first: () => "a",
          childRef: () => {},
          second: () => "b",
        };
        const baseline = load(ORDERED_SOURCES.order, "baseline"),
          compiled = load(ORDERED_SOURCES.order, variant);
        expect(compiled.ssr(props)).toBe(baseline.ssr(props));
        const container = document.createElement("div");
        container.innerHTML = compiled.ssr(props);
        const before = container.firstElementChild;
        const dispose = compiled.hydrateInto(container, props);
        expect(container.firstElementChild).toBe(before);
        dispose();
      },
    );

    it.each(["native", "template"] as const)(
      "%s: a mount failure tears down listeners already bound",
      (variant) => {
        let anchor: Element | null = null;
        let clicks = 0;
        const entry = load(ORDERED_SOURCES.failed, variant);
        expect(() =>
          entry.mount(document.createElement("div"), {
            ref: (el: Element | null) => {
              if (el) anchor = el;
            },
            click: () => clicks++,
            fail: () => {
              throw new Error("mount failed");
            },
          }),
        ).toThrow("mount failed");
        expect(anchor).not.toBeNull();
        anchor!.dispatchEvent(new MouseEvent("click"));
        expect(clicks).toBe(0);
      },
    );
  });
}
