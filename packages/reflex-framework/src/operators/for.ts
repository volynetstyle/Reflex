import type { Accessor, MaybeAccessor } from "../types/core";
import type { JSXRenderable } from "../types/renderable";
import { toAccessor } from "./shared";

export const FOR_RENDERABLE = Symbol.for("reflex-dom.for");

export interface ForProps<T, Host = never> {
  each: MaybeAccessor<readonly T[] | null | undefined>;
  by: (item: T, index: number) => PropertyKey;
  children: (item: T, index: number) => JSXRenderable<Host>;
  fallback?: JSXRenderable<Host>;
}

export interface ForRenderable<T, Host = never> {
  readonly kind: typeof FOR_RENDERABLE;
  readonly each: Accessor<readonly T[] | null | undefined>;
  readonly by: (item: T, index: number) => PropertyKey;
  readonly children: (item: T, index: number) => JSXRenderable<Host>;
  readonly fallback: JSXRenderable<Host>;
}

export function For<T, Host = never>(
  props: ForProps<T, Host>,
): ForRenderable<T, Host> {
  return {
    kind: FOR_RENDERABLE,
    each: toAccessor(props.each),
    by: props.by,
    children: props.children,
    fallback: props.fallback ?? null,
  };
}
