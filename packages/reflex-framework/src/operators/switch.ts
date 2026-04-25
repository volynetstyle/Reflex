import type { Accessor, MaybeAccessor } from "../types/core";
import type { JSXRenderable } from "../types/renderable";
import { type RenderValue, resolveRenderValue, toAccessor } from "./shared";

export const SWITCH_RENDERABLE = Symbol.for("reflex-dom.switch");

export interface SwitchCase<T, Host = never> {
  when: T | ((value: T) => boolean);
  children?: RenderValue<T, Host>;
}

export interface SwitchProps<T, Host = never> {
  value: MaybeAccessor<T>;
  cases: readonly SwitchCase<T, Host>[];
  fallback?: JSXRenderable<Host>;
}

export interface SwitchRenderable<T, Host = never> {
  readonly kind: typeof SWITCH_RENDERABLE;
  readonly value: Accessor<T>;
  readonly cases: readonly SwitchCase<T, Host>[];
  readonly fallback: JSXRenderable<Host>;
}

export function Switch<T, Host = never>(
  props: SwitchProps<T, Host>,
): SwitchRenderable<T, Host> {
  return {
    kind: SWITCH_RENDERABLE,
    value: toAccessor(props.value),
    cases: props.cases,
    fallback: props.fallback ?? null,
  };
}

function isMatchingCase<T>(
  candidate: T | ((value: T) => boolean),
  value: T,
): boolean {
  return typeof candidate === "function"
    ? (candidate as (value: T) => boolean)(value)
    : Object.is(candidate, value);
}

export function resolveSwitchValue<T, Host = never>(
  renderable: SwitchRenderable<T, Host>,
  value: T,
): JSXRenderable<Host> {
  for (let index = 0; index < renderable.cases.length; index++) {
    const current = renderable.cases[index]!;

    if (isMatchingCase(current.when, value)) {
      return resolveRenderValue(current.children, value);
    }
  }

  return renderable.fallback;
}
