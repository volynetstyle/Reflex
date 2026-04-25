import type { Accessor, MaybeAccessor } from "../types/core";
import type { JSXRenderable } from "../types/renderable";

export type RenderValue<T, Host = never> =
  | JSXRenderable<Host>
  | ((value: T) => JSXRenderable<Host>);

export function toAccessor<T>(value: MaybeAccessor<T>): Accessor<T> {
  return typeof value === "function"
    ? (value as Accessor<T>)
    : () => value;
}

export function resolveRenderValue<T, Host = never>(
  value: RenderValue<T, Host> | undefined,
  input: T,
): JSXRenderable<Host> {
  if (typeof value === "function" && value.length > 0) {
    return (value as (value: T) => JSXRenderable<Host>)(input);
  }

  return (value ?? null) as JSXRenderable<Host>;
}
