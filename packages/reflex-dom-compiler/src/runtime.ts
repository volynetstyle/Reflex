/**
 * Helpers imported by compiled modules. Kept tiny and side-effect free: no DOM
 * work happens at import time, only during mount.
 */
import type { JSXRenderable } from "@volynets/reflex-dom";

/** Must match `COMPILED_DOM_RENDERABLE` in reflex-dom. */
const COMPILED_DOM_RENDERABLE = Symbol.for("reflex-dom.compiled");

/** reflex-dom's `CompiledHoleMount`: mounts a hole value at its marker. */
export type HoleMount = (parent: Element, marker: Node, value: unknown, scalar: boolean) => void;

type Create = (doc: Document, mountHole: HoleMount, holes: readonly unknown[] | undefined) => Node | null;
type Fallback = (holes: readonly unknown[] | undefined) => JSXRenderable;

/**
 * The descriptor that replaces one region's element call: a fresh object per
 * evaluation, like the `jsx(...)` call it replaces, carrying the hole values
 * computed at that moment. Methods live on the prototype, so a region costs
 * one allocation.
 */
export class CompiledRegion {
  readonly kind: symbol = COMPILED_DOM_RENDERABLE;

  constructor(
    private readonly build: Create,
    private readonly source: Fallback,
    private readonly holes: readonly unknown[] | undefined,
  ) {}

  create(doc: Document, mountHole: HoleMount): Node | null {
    return this.build(doc, mountHole, this.holes);
  }

  fallback(): JSXRenderable {
    return this.source(this.holes);
  }
}

export function compiled(create: Create, fallback: Fallback, holes?: readonly unknown[]): CompiledRegion {
  return new CompiledRegion(create, fallback, holes);
}

/**
 * Whether the renderer can mount these hole values at markers with exactly
 * the element path's result: text, empty values and at most one accessor.
 * Anything structural would run user code (components, refs) while the
 * region's later static siblings already exist, so it goes to `fallback()`.
 * More than one accessor is excluded too: an accessor whose first value is
 * structural could hand a later accessor a reference into the region.
 */
export function acceptsHoles(holes: readonly unknown[]): boolean {
  let accessors = 0;
  for (const value of holes) {
    switch (typeof value) {
      case "string":
      case "number":
      case "bigint":
      case "boolean":
      case "undefined":
        continue;
      case "function":
        if (++accessors > 1) return false;
        continue;
      default:
        if (value !== null) return false;
    }
  }
  return true;
}

function prepare(html: string, doc: Document): Node | null {
  try {
    // Parse in the mount document's own realm, so its Trusted Types policy
    // applies. Template content is inert: nothing parsed into it loads or
    // runs. An XHTML document borrows an HTML document of the same realm, so
    // the HTML parser runs.
    const owner =
      doc.contentType === "text/html" ? doc : doc.implementation.createHTMLDocument("");
    const template = owner.createElement("template");
    template.innerHTML = html;
    return template.content.firstChild;
  } catch {
    // Trusted Types enforcement rejects plain strings in `innerHTML`. Never
    // work around the policy: report "unavailable" and mount the source tree.
    return null;
  }
}

/**
 * Lazily parses `html` on first mount, then imports a deep copy into each
 * mount document. `importNode` creates the nodes directly in `doc`, so
 * `ownerDocument` and realm match what `doc.createElement` would produce.
 */
export function template(html: string): (doc: Document) => Node | null {
  let prepared: Node | null | undefined;
  let lastDoc: Document | undefined;
  let lastHTML = false;
  return (doc) => {
    if (doc !== lastDoc) {
      // In a non-HTML XML document `createElement` makes null-namespace
      // elements, which imported HTML nodes would not match: use the runtime.
      lastDoc = doc;
      lastHTML = doc.contentType === "text/html" || doc.contentType === "application/xhtml+xml";
    }
    if (!lastHTML) return null;
    if (prepared === undefined) prepared = prepare(html, doc);
    return prepared === null ? null : doc.importNode(prepared, true);
  };
}
