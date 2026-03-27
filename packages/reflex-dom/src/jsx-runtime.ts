import type {
  Attributes,
  IntrinsicElements as ReflexIntrinsicElements,
  JSXRenderable,
} from "./types";

export { Fragment, jsx, jsxs } from "./runtime";

export namespace JSX {
  export type Element = JSXRenderable;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export type IntrinsicAttributes = Attributes;

  export type LibraryManagedAttributes<_, P> = P;

  export type IntrinsicElements = ReflexIntrinsicElements;
}
