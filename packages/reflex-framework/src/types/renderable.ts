import type { Accessor } from "./core";

export type JSXText = string | number | bigint;
export type JSXPrimitive = JSXText | boolean | null | undefined;

export interface RenderableRecord {
  readonly kind: symbol;
}

export type JSXRenderable<Host = never> =
  | JSXPrimitive
  | Host
  | RenderableRecord
  | Iterable<unknown>
  | Accessor<unknown>;

export type Component<P = Record<string, never>, Host = never> = (
  props: P,
) => JSXRenderable<Host>;

export interface ComponentRenderable<
  P = Record<string, never>,
  Host = never,
> extends RenderableRecord {
  readonly type: Component<P, Host>;
  readonly props: P;
}

export interface ElementRenderable<Tag extends string = string, Props = unknown>
  extends RenderableRecord {
  readonly tag: Tag;
  readonly props: Props;
}

export type ComponentProps<T> =
  T extends Component<infer Props, any> ? Props : never;
