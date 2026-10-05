import type {
  Attributes,
  IntrinsicElements as ReflexIntrinsicElements,
  JSXRenderable,
} from "./types";

export { Fragment, jsxDEV } from "@volynets/reflex-framework/jsx-dev-runtime";

// Preserve a distinct name when declaration bundling lifts imports into a chunk.
type DOMIntrinsicElementMap = ReflexIntrinsicElements;

export namespace JSX {
  export type Element = JSXRenderable;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export type IntrinsicAttributes = Attributes;

  export type LibraryManagedAttributes<_, P> = P;

  export type IntrinsicElements = DOMIntrinsicElementMap;
}
