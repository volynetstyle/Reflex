import type { Component, ElementTag } from "../types";
import { isSVGTag } from "../drafts/client/tags";

export type Namespace = "html" | "svg";
export type JSXTag = ElementTag | typeof Fragment | Component<any>;

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

export const Fragment = Symbol.for("reflex-dom.fragment");

export function resolveNamespace(tag: string, parent: Namespace): Namespace {
  if (tag === "foreignObject") return "html";
  if (tag === "svg") return "svg";
  if (parent === "svg") return "svg";
  return isSVGTag(tag) ? "svg" : "html";
}
