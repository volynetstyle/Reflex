import type { Accessor, JSXRenderable } from "../types";
import {
  type MaybeAccessor,
  type RenderValue,
  resolveRenderValue,
  toAccessor,
} from "./shared";

export const SWITCH_RENDERABLE = Symbol.for("reflex-dom.switch");

export interface SwitchCase<T> {
  when: T | ((value: T) => boolean);
  children?: RenderValue<T>;
}

export interface SwitchProps<T> {
  value: MaybeAccessor<T>;
  cases: readonly SwitchCase<T>[];
  fallback?: JSXRenderable;
}

export interface SwitchRenderable<T> {
  readonly kind: typeof SWITCH_RENDERABLE;
  readonly value: Accessor<T>;
  readonly cases: readonly SwitchCase<T>[];
  readonly fallback: JSXRenderable;
}

export function Switch<T>(props: SwitchProps<T>): SwitchRenderable<T> {
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

export function resolveSwitchValue<T>(
  renderable: SwitchRenderable<T>,
  value: T,
): JSXRenderable {
  for (let index = 0; index < renderable.cases.length; index++) {
    const current = renderable.cases[index]!;

    if (isMatchingCase(current.when, value)) {
      return resolveRenderValue(current.children, value);
    }
  }

  return renderable.fallback;
}
