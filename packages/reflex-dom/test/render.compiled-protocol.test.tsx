/** @jsxImportSource ../src */
import { describe, expect, it, vi } from "vitest";
import { hydrate, render, renderToString } from "../src";
import {
  COMPILED_DOM_RENDERABLE,
  type CompiledDOMRenderable,
} from "../src/renderable/compiled";

// The renderer's side of the compiled-region protocol, with hand-written
// regions: no compiler involved.

function region(create: (doc: Document) => Node | null): CompiledDOMRenderable & {
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
    expect(r.create).toHaveBeenCalledWith(other);
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
