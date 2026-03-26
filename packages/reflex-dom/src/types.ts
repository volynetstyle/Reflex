export type Accessor<T> = () => T;

export type StyleObject = Record<string, string | number | null | undefined>;
export type StyleValue = string | StyleObject;

export interface RefObject<T> {
  current: T | null;
}

export type Ref<T> = RefObject<T> | ((value: T | null) => void);

export type Cleanup = (() => void) & { dispose?: () => void };

export type JSXPrimitive =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined;

export type JSXRenderable =
  | JSXPrimitive
  | Node
  | object
  | ReadonlyArray<unknown>
  | Accessor<unknown>;

export type Component<P = Record<string, unknown>> = (
  props: P,
) => JSXRenderable;

export interface ComponentRenderable<P = Record<string, unknown>> {
  readonly kind: symbol;
  readonly type: Component<P>;
  readonly props: P;
}

export interface ElementRenderable {
  readonly kind: symbol;
  readonly tag: string;
  readonly props: DOMProps;
}

export interface DOMProps<T extends Element = Element> {
  children?: JSXRenderable;
  ref?: Ref<T>;
  class?: string | Accessor<string | null | undefined> | null | undefined;
  className?: string | Accessor<string | null | undefined> | null | undefined;
  style?: StyleValue | Accessor<StyleValue | null | undefined> | null | undefined;
  [name: string]: unknown;
}

type HTMLIntrinsicElements = {
  [Tag in keyof HTMLElementTagNameMap]: DOMProps<HTMLElementTagNameMap[Tag]>;
};

type SVGIntrinsicElements = {
  [Tag in keyof SVGElementTagNameMap]: DOMProps<SVGElementTagNameMap[Tag]>;
};

export type IntrinsicElements = HTMLIntrinsicElements & SVGIntrinsicElements;
