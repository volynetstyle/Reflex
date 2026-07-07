import type { Accessor, AttributeKey } from "./core";

export const COMPONENT_RENDERABLE: unique symbol =
  Symbol.for("reflex.component");
export const ELEMENT_RENDERABLE: unique symbol = Symbol.for("reflex.element");

/**
 * Text values that can be rendered directly.
 *
 * `bigint` is allowed because it has a deterministic string representation.
 */
export type JSXText = string | number | bigint;

/**
 * Primitive JSX values.
 *
 * `boolean`, `null`, and `undefined` are renderable as "nothing".
 * They are useful for conditional expressions:
 *
 * ```tsx
 * {isVisible() && <Panel />}
 * ```
 */
export type JSXPrimitive = JSXText | boolean | null | undefined;

/**
 * Base marker for internal renderable records.
 *
 * Every framework-level renderable object should carry a symbolic `kind`.
 * This avoids depending on string tags like `"component"` or `"element"`,
 * which are easier to collide with user data.
 */
export interface RenderableRecord {
  readonly kind: symbol;
}

/**
 * Anything that can be returned from JSX, components, accessors, or operators.
 *
 * This is the central renderable contract.
 *
 * It supports:
 * - primitive values;
 * - host-native values;
 * - framework renderable records;
 * - iterable children;
 * - reactive accessors returning renderable values.
 *
 * `Host` defaults to `never` so the framework core does not accidentally accept
 * DOM nodes or other host-specific objects. A host renderer may widen it:
 *
 * ```ts
 * JSXRenderable<Node>
 * ```
 */
export type JSXRenderable<Host = never> =
  | JSXPrimitive
  | Host
  | RenderableRecord
  | Iterable<JSXRenderable<Host>>
  | JSXAccessor<Host>;

export interface JSXAccessor<Host = never> extends Accessor<
  JSXRenderable<Host>
> {}
/**
 * Alias for a JSX child value.
 *
 * Exists mostly for readability in public APIs.
 */
export type JSXChild<Host = never> = JSXRenderable<Host>;

/**
 * Props shape with optional JSX children.
 *
 * Useful for component props:
 *
 * ```ts
 * interface Props {
 *   children?: JSXChildren;
 * }
 * ```
 */
export type JSXChildren<Host = never> = JSXRenderable<Host>;

/**
 * A function component.
 *
 * Components receive props and return any renderable value.
 *
 * The component itself is not directly treated as a renderable value.
 * JSX should lower component usage into a `ComponentRenderable` record.
 */
export type Component<P = Record<string, never>, Host = never> = (
  props: P,
) => JSXRenderable<Host>;

/**
 * Internal renderable representation of a component call.
 *
 * Example source:
 *
 * ```tsx
 * <Counter initial={1} />
 * ```
 *
 * Lowered representation:
 *
 * ```ts
 * {
 *   kind: COMPONENT_RENDERABLE,
 *   type: Counter,
 *   props: { initial: 1 }
 * }
 * ```
 */
export interface ComponentRenderable<
  P = Record<string, never>,
  Host = never,
> extends RenderableRecord {
  readonly kind: typeof COMPONENT_RENDERABLE;

  /**
   * Component function to execute during mounting/render interpretation.
   */
  readonly type: Component<P, Host>;

  /**
   * Props passed to the component.
   */
  readonly props: P;

  readonly key: AttributeKey | null;
}

/**
 * Internal renderable representation of a host element.
 *
 * Example source:
 *
 * ```tsx
 * <div class="box" />
 * ```
 *
 * Lowered representation:
 *
 * ```ts
 * {
 *   kind: ELEMENT_RENDERABLE,
 *   tag: "div",
 *   props: { class: "box" }
 * }
 * ```
 */
export interface ElementRenderable<
  Tag extends string = string,
  Props = unknown,
> extends RenderableRecord {
  readonly kind: typeof ELEMENT_RENDERABLE;

  /**
   * Host tag name.
   *
   * For DOM this may be `"div"`, `"span"`, `"button"`, etc.
   * Other hosts may interpret tags differently.
   */
  readonly tag: Tag;

  /**
   * Host-specific props.
   *
   * The core should not assume DOM semantics here.
   */
  readonly props: Props;

  readonly key: AttributeKey | null;
}

/**
 * Extract props from a component-like function.
 *
 * ```ts
 * type Props = ComponentProps<typeof Counter>;
 * ```
 */
export type ComponentProps<T> = T extends (props: infer Props) => unknown
  ? Props
  : never;

/**
 * Adds JSX children to a props object.
 *
 * Useful when declaring components manually:
 *
 * ```ts
 * type PanelProps = PropsWithChildren<{
 *   title: string;
 * }>;
 * ```
 */
export type PropsWithChildren<P, Host = never> = P & {
  children?: JSXChildren<Host>;
};
