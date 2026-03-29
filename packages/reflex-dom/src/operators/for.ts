import type { Accessor, JSXRenderable } from "../types";
import { type MaybeAccessor, toAccessor } from "./shared";

export const FOR_RENDERABLE = Symbol.for("reflex-dom.for");

export interface ForProps<T> {
  each: MaybeAccessor<readonly T[] | null | undefined>;
  by: (item: T, index: number) => PropertyKey;
  children: (item: T, index: number) => JSXRenderable;
  fallback?: JSXRenderable;
}

export interface ForRenderable<T> {
  readonly kind: typeof FOR_RENDERABLE;
  readonly each: Accessor<readonly T[] | null | undefined>;
  readonly by: (item: T, index: number) => PropertyKey;
  readonly children: (item: T, index: number) => JSXRenderable;
  readonly fallback: JSXRenderable;
}

export function For<T>(props: ForProps<T>): ForRenderable<T> {
  return {
    kind: FOR_RENDERABLE,
    each: toAccessor(props.each),
    by: props.by,
    children: props.children,
    fallback: props.fallback ?? null,
  };
}
