import type {
  Component as FrameworkComponent,
  ComponentRenderable as FrameworkComponentRenderable,
  JSXRenderable as FrameworkJSXRenderable,
} from "reflex-framework";

export type {
  ComponentProps,
  ElementRenderable,
  JSXPrimitive,
  JSXText,
  RenderableRecord,
} from "reflex-framework";

export type JSXRenderable = FrameworkJSXRenderable<Node>;

export type Component<P = Record<string, never>> = FrameworkComponent<P, Node>;

export type ComponentRenderable<P = Record<string, never>> =
  FrameworkComponentRenderable<P, Node>;
