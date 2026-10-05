import type {
  Attributes as DOMIntrinsicAttributes,
  IntrinsicElements as DOMIntrinsicElements,
  JSXRenderable,
} from "./types";

export { Fragment, jsx, jsxs } from "@volynets/reflex-framework/jsx-runtime";

// Preserve a distinct name when declaration bundling lifts imports into a chunk.
type DOMIntrinsicElementMap = DOMIntrinsicElements;

export namespace JSX {
  export type Element = JSXRenderable;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export type IntrinsicAttributes = DOMIntrinsicAttributes;

  export type LibraryManagedAttributes<_, P> = P;

  export type IntrinsicElements = DOMIntrinsicElementMap;
}
