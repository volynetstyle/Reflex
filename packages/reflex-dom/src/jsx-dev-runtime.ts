export { Fragment, jsxDEV } from "./runtime";

export namespace JSX {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  export type Element = import("./types").JSXRenderable;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  export type ElementType =
    | import("./types").ElementTag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | import("./types").Component<any>;

  export interface ElementChildrenAttribute {
    children: {};
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  export type IntrinsicAttributes = import("./types").Attributes;

  export type LibraryManagedAttributes<C, P> = P;

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  export type IntrinsicElements = import("./types").IntrinsicElements;
}
