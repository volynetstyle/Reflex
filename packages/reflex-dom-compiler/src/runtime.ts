/**
 * Helpers imported by compiled modules. Kept tiny and side-effect free: no DOM
 * work happens at import time, only during mount.
 */
import type { JSXRenderable } from "@volynets/reflex-dom";

/** Must match `COMPILED_DOM_RENDERABLE` in reflex-dom. */
const COMPILED_DOM_RENDERABLE = Symbol.for("reflex-dom.compiled");

export interface CompiledRegion {
  readonly kind: symbol;
  create(doc: Document): Node | null;
  fallback(): JSXRenderable;
}

/**
 * The descriptor that replaces one static element call. A fresh object per
 * evaluation, like the `jsx(...)` call it replaces.
 */
export function compiled(
  create: (doc: Document) => Node | null,
  fallback: () => JSXRenderable,
): CompiledRegion {
  return { kind: COMPILED_DOM_RENDERABLE, create, fallback };
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
