export { Fragment, jsxDEV } from "./runtime";

export namespace JSX {
  export type Element = import("./types").JSXRenderable;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicAttributes {
    key?: string | number;
  }

  export type IntrinsicElements = import("./types").IntrinsicElements;
}
