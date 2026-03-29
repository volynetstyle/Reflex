import type { Accessor, JSXRenderable } from "../types";
import {
  type MaybeAccessor,
  type RenderValue,
  resolveRenderValue,
  toAccessor,
} from "./shared";

export const SHOW_RENDERABLE = Symbol.for("reflex-dom.show");

export interface ShowProps<T> {
  when: MaybeAccessor<T>;
  children?: RenderValue<NonNullable<T>>;
  fallback?: JSXRenderable;
}

export interface ShowRenderable<T> {
  readonly kind: typeof SHOW_RENDERABLE;
  readonly when: Accessor<T>;
  readonly children?: RenderValue<NonNullable<T>>;
  readonly fallback: JSXRenderable;
}

export function Show<T>(props: ShowProps<T>): ShowRenderable<T> {
  return {
    kind: SHOW_RENDERABLE,
    when: toAccessor(props.when),
    children: props.children,
    fallback: props.fallback ?? null,
  };
}

export function resolveShowValue<T>(
  renderable: ShowRenderable<T>,
  value: T,
): JSXRenderable {
  return value
    ? resolveRenderValue(
        renderable.children as RenderValue<NonNullable<T>> | undefined,
        value as NonNullable<T>,
      )
    : renderable.fallback;
}
