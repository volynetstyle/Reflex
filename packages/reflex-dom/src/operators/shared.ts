import type { Accessor, JSXRenderable } from "../types";

export type MaybeAccessor<T> = T | Accessor<T>;
export type RenderValue<T> = JSXRenderable | ((value: T) => JSXRenderable);

export function toAccessor<T>(value: MaybeAccessor<T>): Accessor<T> {
  return typeof value === "function"
    ? (value as Accessor<T>)
    : () => value;
}

export function resolveRenderValue<T>(
  value: RenderValue<T> | undefined,
  input: T,
): JSXRenderable {
  if (typeof value === "function" && value.length > 0) {
    return (value as (value: T) => JSXRenderable)(input);
  }

  return (value ?? null) as JSXRenderable;
}
