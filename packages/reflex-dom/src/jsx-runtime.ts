import type {
  Attributes as DOMIntrinsicAttributes,
  IntrinsicElements as DOMIntrinsicElements,
  JSXRenderable,
} from "./types";

export { Fragment, jsx, jsxs } from "reflex-framework/jsx-runtime";

export namespace JSX {
  export type Element = JSXRenderable;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export type IntrinsicAttributes = DOMIntrinsicAttributes;

  export type LibraryManagedAttributes<_, P> = P;

  export type IntrinsicElements = DOMIntrinsicElements;
}
