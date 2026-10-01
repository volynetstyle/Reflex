import type { Accessor, MaybeAccessor } from "../types/core";
import type { JSXRenderable } from "../types/renderable";
import { type RenderValue, resolveRenderValue, toAccessor } from "./shared";

export const SHOW_RENDERABLE = Symbol.for("reflex-dom.show");

export interface ShowProps<T, Host = never> {
  /** Static or reactive value tested using truthiness. */
  when: MaybeAccessor<T>;
  /** Branch content, optionally a function receiving the non-null condition value. */
  children?: RenderValue<NonNullable<T>, Host>;
  /** Content rendered when `when` is falsy. */
  fallback?: JSXRenderable<Host>;
}

export interface ShowRenderable<T, Host = never> {
  readonly kind: typeof SHOW_RENDERABLE;
  readonly when: Accessor<T>;
  readonly children?: RenderValue<NonNullable<T>, Host>;
  readonly fallback: JSXRenderable<Host>;
}

export function Show<T, Host = never>(
  props: ShowProps<T, Host>,
): ShowRenderable<T, Host> {
  return {
    kind: SHOW_RENDERABLE,
    when: toAccessor(props.when),
    children: props.children,
    fallback: props.fallback ?? null,
  };
}

export function resolveShowValue<T, Host = never>(
  renderable: ShowRenderable<T, Host>,
  value: T,
): JSXRenderable<Host> {
  return value
    ? resolveRenderValue(
        renderable.children as RenderValue<NonNullable<T>, Host> | undefined,
        value as NonNullable<T>,
      )
    : renderable.fallback;
}
