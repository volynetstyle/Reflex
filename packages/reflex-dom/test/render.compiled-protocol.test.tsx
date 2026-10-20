/** @jsxImportSource ../src */
import { describe, expect, it, vi } from "vitest";
import { createDOMRuntime, hydrate, render, renderToString } from "../src";
import { signal } from "./reactivity";
import {
  COMPILED_DOM_RENDERABLE,
  type CompiledDOMRenderable,
  type CompiledHoleMount,
} from "../src/renderable/compiled";

// The renderer's side of the compiled-region protocol, with hand-written
// regions: no compiler involved.

function region(create: (doc: Document, mountHole: CompiledHoleMount) => Node | null): CompiledDOMRenderable & {
  create: ReturnType<typeof vi.fn>;
  fallback: ReturnType<typeof vi.fn>;
} {
  return {
    kind: COMPILED_DOM_RENDERABLE,
    create: vi.fn(create),
    fallback: vi.fn(() => <p class="r">region</p>),
  };
}

const build = (doc: Document) => {
  const p = doc.createElement("p");
  p.className = "r";
  p.textContent = "region";
  return p;
};

describe("compiled region protocol", () => {
  it("client mount in the HTML namespace calls create with the mount document", () => {
    const other = document.implementation.createHTMLDocument("other");
    const container = other.createElement("div");
    const r = region(build);
    const dispose = render(r, container);

    expect(r.create).toHaveBeenCalledTimes(1);
    expect(r.create).toHaveBeenCalledWith(other, expect.any(Function), expect.objectContaining({ version: 1 }));
    expect(r.fallback).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe(`<p class="r">region</p>`);
    dispose();
    expect(container.innerHTML).toBe("");
  });

  it("does not create the region before mount", () => {
    const r = region(build);
    expect(r.create).not.toHaveBeenCalled();
    render(r, document.createElement("div"))();
    expect(r.create).toHaveBeenCalledTimes(1);
  });

  it("any other namespace mounts fallback()", () => {
    const container = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const r = region(build);
    render(r, container);
    expect(r.create).not.toHaveBeenCalled();
    expect(r.fallback).toHaveBeenCalledTimes(1);
    expect(container.firstElementChild!.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  it("create returning null mounts fallback()", () => {
    const container = document.createElement("div");
    const r = region(() => null);
    render(r, container);
    expect(r.create).toHaveBeenCalledTimes(1);
    expect(r.fallback).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe(`<p class="r">region</p>`);
  });

  it("create exceptions propagate", () => {
    const r = region(() => {
      throw new Error("create failed");
    });
    expect(() => render(r, document.createElement("div"))).toThrow("create failed");
    expect(r.fallback).not.toHaveBeenCalled();
  });

  it("SSR renders fallback()", () => {
    const r = region(build);
    expect(renderToString(<div>{r}</div>)).toBe(renderToString(<div><p class="r">region</p></div>));
    expect(r.create).not.toHaveBeenCalled();
  });

  it("hydration adopts server nodes through fallback()", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<div>{region(build)}</div>);
    const serverParagraph = container.querySelector("p")!;
    const r = region(build);
    hydrate(<div>{r}</div>, container);
    expect(r.create).not.toHaveBeenCalled();
    expect(r.fallback).toHaveBeenCalled();
    expect(container.querySelector("p")).toBe(serverParagraph);
  });
});

// A region with one dynamic child: <p>[static] [hole] [static]</p>.
function holeRegion(value: unknown, scalar = false) {
  return region((doc, mountHole) => {
    const p = doc.createElement("p");
    const marker = doc.createComment("");
    if (scalar) p.append(marker);
    else p.append("a", marker, "b");
    mountHole(p, marker, value, scalar);
    return p;
  });
}

describe("compiled region holes", () => {
  const html = (value: unknown, scalar = false) => {
    const container = document.createElement("div");
    render(holeRegion(value, scalar), container);
    return container.innerHTML;
  };
  const texts = (value: unknown, scalar = false) => {
    const container = document.createElement("div");
    render(holeRegion(value, scalar), container);
    return Array.from(container.querySelector("p")!.childNodes, (node) => [node.nodeType, node.nodeValue]);
  };

  it("mounts text at the marker and removes it", () => {
    expect(html("x")).toBe("<p>axb</p>");
    expect(html(5)).toBe("<p>a5b</p>");
    expect(html(2n)).toBe("<p>a2b</p>");
  });

  it("follows the array rules for text and empty values", () => {
    expect(texts("")).toEqual([[3, "a"], [3, ""], [3, "b"]]);
    expect(texts(null)).toEqual([[3, "a"], [3, "b"]]);
    expect(texts(false)).toEqual([[3, "a"], [3, "b"]]);
  });

  it("follows the textContent rule for a scalar child", () => {
    expect(texts("x", true)).toEqual([[3, "x"]]);
    expect(texts("", true)).toEqual([]);
    expect(texts(undefined, true)).toEqual([]);
  });

  it("binds accessors in place and updates them", () => {
    createDOMRuntime();
    const [name, setName] = signal("one");
    const container = document.createElement("div");
    render(holeRegion(name), container);
    const text = container.querySelector("p")!.childNodes[1];
    expect(container.innerHTML).toBe("<p>aoneb</p>");
    setName("two");
    expect(container.innerHTML).toBe("<p>atwob</p>");
    expect(container.querySelector("p")!.childNodes[1]).toBe(text);
  });

  it("mounts structural accessor values at the marker", () => {
    createDOMRuntime();
    const container = document.createElement("div");
    render(holeRegion(() => <i>s</i>), container);
    expect(container.innerHTML).toContain("<i>s</i>");
    expect(container.innerHTML.indexOf("a")).toBeLessThan(container.innerHTML.indexOf("<i>"));
    expect(container.innerHTML.endsWith("b</p>")).toBe(true);
  });

  it("rejects values the region should have routed to fallback()", () => {
    expect(() => html({ kind: Symbol("other") })).toThrow("Unsupported compiled hole value");
  });
});
