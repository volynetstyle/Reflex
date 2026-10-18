import { isHTMLTag, isMathMLTag, isSVGTag } from "./tags";

export type Namespace = "html" | "svg" | "mathml";

export const SVG_NS = "http://www.w3.org/2000/svg";
export const MATHML_NS = "http://www.w3.org/1998/Math/MathML";
export const XLINK_NS = "http://www.w3.org/1999/xlink";

export const URL_ATTRS = new Set<string>([
  "action",
  "formaction",
  "href",
  "poster",
  "src",
  "xlink:href",
]);

/**
 * Namespace of an element named `tag` created in a `parent` context.
 *
 * Mirrors the HTML parser: `<svg>` and `<math>` open their namespace, foreign
 * content keeps its namespace, and in an HTML context a tag defined by both
 * HTML and SVG (`a`, `script`, `style`, `title`) is an HTML element. Tags that
 * only exist in SVG or MathML are created in that namespace even without an
 * `<svg>`/`<math>` ancestor, so components can return foreign fragments.
 */
export function resolveNamespace(tag: string, parent: Namespace): Namespace {
  if (tag === "svg") return "svg";
  if (tag === "math") return "mathml";

  if (parent !== "html") return parent;

  if (isHTMLTag(tag)) return "html";
  if (isMathMLTag(tag)) return "mathml";
  if (isSVGTag(tag)) return "svg";

  return "html";
}

/**
 * Namespace context for the children of an element named `tag` in `ns`.
 *
 * HTML integration points (`foreignObject`, SVG `desc`/`title`, MathML text
 * integration points and `annotation-xml`) switch their children back to an
 * HTML context, as the HTML parser does; nested `<svg>`/`<math>` and foreign
 * tags still resolve to their own namespace.
 */
export function resolveChildNamespace(tag: string, ns: Namespace): Namespace {
  switch (ns) {
    case "svg":
      return tag === "foreignObject" || tag === "desc" || tag === "title"
        ? "html"
        : ns;
    case "mathml":
      return tag === "mi" ||
        tag === "mo" ||
        tag === "mn" ||
        tag === "ms" ||
        tag === "mtext" ||
        tag === "annotation-xml"
        ? "html"
        : ns;
    default:
      return ns;
  }
}

/** Namespace context for content rendered directly into `container`. */
export function resolveContainerNamespace(container: Node): Namespace {
  if (container.nodeType !== 1) return "html";

  const element = container as Element;

  switch (element.namespaceURI) {
    case SVG_NS:
      return resolveChildNamespace(element.localName, "svg");
    case MATHML_NS:
      return resolveChildNamespace(element.localName, "mathml");
    default:
      return "html";
  }
}