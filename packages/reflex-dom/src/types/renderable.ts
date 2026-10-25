import type {
  Component as FrameworkComponent,
  ComponentRenderable as FrameworkComponentRenderable,
  JSXRenderable as FrameworkJSXRenderable,
} from "@volynets/reflex-framework";
import type { ElementProps, ElementTag } from "./intrinsics";

export type {
  ElementRenderable,
  JSXPrimitive,
  JSXText,
  RenderableRecord,
} from "@volynets/reflex-framework";

/** Values accepted as content by the DOM renderer. Strings are rendered as text. */
export type JSXRenderable = FrameworkJSXRenderable<Node>;

/** A function component rendering into the DOM. */
export type Component<P = Record<string, never>> = FrameworkComponent<P, Node>;

export type ComponentRenderable<P = Record<string, never>> =
  FrameworkComponentRenderable<P, Node>;

/**
 * Anything usable as a JSX tag: an intrinsic tag name or a function that takes
 * props and returns renderable content.
 */
export type ComponentType =
  | ElementTag
  // Props are checked at the JSX site; `any` keeps every component assignable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | ((props: any) => JSXRenderable);

/**
 * Props of a component function or of an intrinsic tag.
 *
 * ```ts
 * type ButtonProps = ComponentProps<"button">;
 * type CounterProps = ComponentProps<typeof Counter>;
 * ```
 */
export type ComponentProps<T> = T extends ElementTag
  ? ElementProps<T>
  : T extends (props: infer Props) => unknown
    ? Props
    : never;

/** Adds optional DOM children to a props object. */
export type PropsWithChildren<P = unknown> = P & {
  children?: JSXRenderable;
};
