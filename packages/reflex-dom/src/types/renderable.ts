import type { Accessor } from "./core";

export type JSXText = string | number | bigint;
export type JSXPrimitive = JSXText | boolean | null | undefined;

export interface RenderableRecord {
  readonly kind: symbol;
}

export type JSXRenderable =
  | JSXPrimitive
  | Node
  | RenderableRecord
  | Iterable<unknown>
  | Accessor<unknown>;

export type Component<P = Record<string, never>> = (props: P) => JSXRenderable;

export interface ComponentRenderable<P = Record<string, never>>
  extends RenderableRecord {
  readonly type: Component<P>;
  readonly props: P;
}

export interface ElementRenderable<Tag extends string = string, Props = unknown>
  extends RenderableRecord {
  readonly tag: Tag;
  readonly props: Props;
}

export type ComponentProps<T> =
  T extends Component<infer Props> ? Props : never;
