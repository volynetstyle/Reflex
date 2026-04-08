import type { Attributes } from "./types/core";
import type { JSXRenderable } from "./types/renderable";

export { Fragment, jsxDEV } from "./runtime/jsx";

export namespace JSX {
  export type Element = JSXRenderable<unknown>;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export type IntrinsicAttributes = Attributes;

  export type LibraryManagedAttributes<_, P> = P;
}
