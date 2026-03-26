import { Component } from "../types";
import { isSVGTag } from "../drafts/client/tags";

export type Namespace = "html" | "svg";
export type JSXTag = string | typeof Fragment | Component<any>;

export const SVG_NS = "http://www.w3.org/2000/svg";
export const XLINK_NS = "http://www.w3.org/1999/xlink";

export const URL_ATTRS = new Set([
  "action",
  "formaction",
  "href",
  "poster",
  "src",
  "xlink:href",
]);

export const Fragment = Symbol.for("reflex-dom.fragment");

export function resolveNamespace(tag: string, parent: Namespace): Namespace {
  if (tag === "svg") return "svg";
  if (tag === "foreignObject") return "html";
  return parent === "svg" || isSVGTag(tag) ? "svg" : "html";
}

