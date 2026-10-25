import { afterEach, describe, expect, it, vi } from "vitest";
import { compileLowered, type Variant } from "./harness/compile.node";
import { evaluate, mountApp } from "./harness/dom";

// Every use of App is a consumed position, so its region compiles.
const SOURCE = `import { jsx, jsxs } from "@volynets/reflex-dom/jsx-runtime";
import { hydrate, render, renderToString } from "@volynets/reflex-dom";
function App() {
  return jsxs("section", { class: "profile", children: [
    jsx("h2", { children: "Profile" }),
    jsxs("p", { children: ["a & b ", jsx("b", { children: "<c>" })] }),
  ] });
}
export const mount = (container) => render(jsx(App, {}), container);
export const ssr = () => renderToString(jsx(App, {}));
export const hydrateInto = (container) => hydrate(jsx(App, {}), container);
`;

const HTML = `<section class="profile"><h2>Profile</h2><p>a &amp; b <b>&lt;c&gt;</b></p></section>`;

interface Entry {
  mount: (container: Element) => () => void;
  ssr: () => string;
  hydrateInto: (container: Element) => () => void;
}

function load(variant: Variant): Entry {
  const { body, report } = compileLowered(SOURCE, variant);
  if (variant !== "baseline") {
    expect(report!.regions.map((r) => r.strategy)).toEqual([variant]);
  }
  return evaluate(body) as unknown as Entry;
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
    const mounted = mountApp(load(variant).mount);
    expect(mounted.html).toBe(HTML);
    mounted.dispose();
  });

  it("server-renders through the fallback", () => {
    expect(load(variant).ssr()).toBe(load("baseline").ssr());
  });

  it("hydrates through the fallback, adopting the server nodes", () => {
    const hydrateEntry = (entry: Entry) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      container.innerHTML = entry.ssr();
      const before = allNodes(container);
      const dispose = entry.hydrateInto(container);
      const after = allNodes(container);
      return { before, after, html: container.innerHTML, dispose };
    };

    const baseline = hydrateEntry(load("baseline"));
    const result = hydrateEntry(load(variant));

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
    const mount = (entry: Entry) => {
      const container = xml.createElementNS(null, "host");
      xml.documentElement.appendChild(container);
      const dispose = entry.mount(container);
      const element = container.firstElementChild!;
      const result = { namespace: element.namespaceURI, xml: new XMLSerializer().serializeToString(container) };
      dispose();
      return result;
    };
    expect(mount(load(variant))).toEqual(mount(load("baseline")));
  });

  it("creates fresh nodes for every mount", () => {
    const entry = load(variant);
    const first = mountApp(entry.mount);
    const second = mountApp(entry.mount);
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
    const entry = load("template");
    for (let i = 0; i < 3; i++) mountApp(entry.mount).dispose();
    const parses = setter.mock.calls.filter(([html]) => html === HTML);
    expect(parses).toHaveLength(1);
  });

  it("falls back to the source tree when HTML parsing is refused", () => {
    // What a Trusted Types policy does to plain strings in `innerHTML`.
    vi.spyOn(Element.prototype, "innerHTML", "set").mockImplementation(() => {
      throw new TypeError("This document requires 'TrustedHTML' assignment.");
    });
    const entry = load("template");
    const mounted = mountApp(entry.mount);
    vi.restoreAllMocks();
    expect(mounted.html).toBe(HTML);
    // The refusal reaches no observer: the fallback mounts like the baseline.
    expect(mounted.mutations).toEqual(mountApp(load("baseline").mount).mutations);
    mounted.dispose();
  });
});
