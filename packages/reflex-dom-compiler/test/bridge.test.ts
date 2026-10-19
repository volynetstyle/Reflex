import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrate, render, renderToString } from "@volynets/reflex-dom";
import { jsx } from "@volynets/reflex-dom/jsx-runtime";
import { compiled } from "../src/runtime";
import { compileLowered, type Variant } from "./harness/compile.node";
import { evaluate, mountApp } from "./harness/dom";

const SOURCE = `import { jsx, jsxs } from "@volynets/reflex-dom/jsx-runtime";
export default function App() {
  return jsxs("section", { class: "profile", children: [
    jsx("h2", { children: "Profile" }),
    jsxs("p", { children: ["a & b ", jsx("b", { children: "<c>" })] }),
  ] });
}`;

const HTML = `<section class="profile"><h2>Profile</h2><p>a &amp; b <b>&lt;c&gt;</b></p></section>`;

function load(variant: Variant): () => unknown {
  return evaluate(compileLowered(SOURCE, variant).body).default as () => unknown;
}

function allNodes(root: Node): Node[] {
  const nodes: Node[] = [];
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_ALL);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) nodes.push(node);
  return nodes;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = "";
});

describe.each(["native", "template"] as const)("compiled region bridge (%s)", (variant) => {
  it("mounts the same DOM as the source tree", () => {
    const mounted = mountApp(load(variant));
    expect(mounted.html).toBe(HTML);
    mounted.dispose();
  });

  it("server-renders through the fallback", () => {
    expect(renderToString(jsx(load(variant), {}))).toBe(renderToString(jsx(load("baseline"), {})));
  });

  it("hydrates through the fallback, adopting the server nodes", () => {
    const hydrateApp = (App: () => unknown) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      container.innerHTML = renderToString(jsx(App, {}));
      const before = allNodes(container);
      const dispose = hydrate(jsx(App, {}), container);
      const after = allNodes(container);
      return { before, after, html: container.innerHTML, dispose };
    };

    const baseline = hydrateApp(load("baseline"));
    const result = hydrateApp(load(variant));

    // Every server node is adopted, none recreated; hydration's own anchors
    // are the same as for the source tree.
    expect(result.before.every((node) => result.after.includes(node))).toBe(true);
    expect(result.after.length).toBe(baseline.after.length);
    expect(result.html).toBe(baseline.html);
    expect(result.html).toContain(HTML);
    baseline.dispose();
    result.dispose();
  });

  it("matches the source tree in a non-HTML XML document", () => {
    const xml = document.implementation.createDocument(null, "root", null);
    const mount = (App: () => unknown) => {
      const container = xml.createElementNS(null, "host");
      xml.documentElement.appendChild(container);
      const dispose = render(jsx(App, {}), container);
      const element = container.firstElementChild!;
      const result = { namespace: element.namespaceURI, xml: new XMLSerializer().serializeToString(container) };
      dispose();
      return result;
    };
    expect(mount(load(variant))).toEqual(mount(load("baseline")));
  });

  it("creates fresh nodes for every mount", () => {
    const App = load(variant);
    const first = mountApp(App);
    const second = mountApp(App);
    const shared = allNodes(first.container).filter((node) => allNodes(second.container).includes(node));
    expect(shared).toEqual([]);
    expect(second.html).toBe(first.html);
    first.dispose();
    second.dispose();
  });
});

describe("template preparation", () => {
  it("parses each region once, however often it mounts", () => {
    const setter = vi.spyOn(Element.prototype, "innerHTML", "set");
    const App = load("template");
    for (let i = 0; i < 3; i++) mountApp(App).dispose();
    const parses = setter.mock.calls.filter(([html]) => html === HTML);
    expect(parses).toHaveLength(1);
  });

  it("falls back to the source tree when HTML parsing is refused", () => {
    // What a Trusted Types policy does to plain strings in `innerHTML`.
    vi.spyOn(Element.prototype, "innerHTML", "set").mockImplementation(() => {
      throw new TypeError("This document requires 'TrustedHTML' assignment.");
    });
    const mounted = mountApp(load("template"));
    vi.restoreAllMocks();
    expect(mounted.html).toBe(HTML);
    mounted.dispose();
  });
});

describe("renderer contract", () => {
  it("mounts fallback() when create returns null", () => {
    const container = document.createElement("div");
    const dispose = render(compiled(() => null, () => jsx("p", { children: "fallback" })), container);
    expect(container.innerHTML).toBe("<p>fallback</p>");
    dispose();
    expect(container.innerHTML).toBe("");
  });

  it("does not call create outside the HTML namespace", () => {
    const create = vi.fn(() => document.createElement("a"));
    const container = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const dispose = render(compiled(create, () => jsx("a", { href: "#x" })), container);
    expect(create).not.toHaveBeenCalled();
    expect(container.firstElementChild!.namespaceURI).toBe("http://www.w3.org/2000/svg");
    dispose();
  });

  it("creates nodes during mount, in the mount document", () => {
    const create = vi.fn((doc: Document) => doc.createElement("p"));
    const region = compiled(create, () => null);
    expect(create).not.toHaveBeenCalled();

    const other = document.implementation.createHTMLDocument("other");
    const container = other.createElement("div");
    render(region, container);
    expect(create).toHaveBeenCalledWith(other);
    expect(container.firstChild!.ownerDocument).toBe(other);
  });
});
