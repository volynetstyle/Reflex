import { isSVGTag } from "./tags";

export type Namespace = "html" | "svg";

export const SVG_NS = "http://www.w3.org/2000/svg";
export const XLINK_NS = "http://www.w3.org/1999/xlink";

export const URL_ATTRS = new Set<string>([
  "action",
  "formaction",
  "href",
  "poster",
  "src",
  "xlink:href",
]);

export function resolveNamespace(tag: string, parent: Namespace): Namespace {
  if (tag === "foreignObject") return "html";
  if (tag === "svg") return "svg";
  if (parent === "svg") return "svg";
  return isSVGTag(tag) ? "svg" : "html";
}
