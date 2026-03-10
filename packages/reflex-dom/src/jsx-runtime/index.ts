export type { JSX } from "./jsx.d.ts";
import type { JSX } from "./jsx.d.ts";

function Fragment(props: { children: JSX.Element }) {
  return props.children;
}

function jsx(type: any, props: any) {}

export { jsx, jsx as jsxs, jsx as jsxDEV, Fragment };
