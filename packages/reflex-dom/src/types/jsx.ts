import type { Attributes } from "./core";
import type { IntrinsicElements as DOMIntrinsicElements } from "./intrinsics";
import type { ComponentType, JSXRenderable } from "./renderable";

// Preserve distinct names when declaration bundling lifts imports into a chunk.
type DOMIntrinsicElementMap = DOMIntrinsicElements;
type DOMElementType = ComponentType;

/** JSX namespace for `jsxImportSource: "@volynets/reflex-dom"`. */
export namespace JSX {
  /** The value of a JSX expression. */
  export type Element = JSXRenderable;

  /**
   * Valid JSX tags (TypeScript 5.1+): intrinsic tag names and functions
   * returning any renderable value, including strings, arrays and `null`.
   */
  export type ElementType = DOMElementType;

  export interface ElementChildrenAttribute {
    children: {};
  }

  /** Attributes accepted by every element and component (`key`). */
  export type IntrinsicAttributes = Attributes;

  /** Props are used as declared; Reflex has no `defaultProps`. */
  export type LibraryManagedAttributes<_, P> = P;

  export type IntrinsicElements = DOMIntrinsicElementMap;
}
