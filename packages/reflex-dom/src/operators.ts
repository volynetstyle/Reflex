import type { Accessor, JSXRenderable } from "./types";

export const SHOW_RENDERABLE = Symbol.for("reflex-dom.show");
export const SWITCH_RENDERABLE = Symbol.for("reflex-dom.switch");
export const FOR_RENDERABLE = Symbol.for("reflex-dom.for");

type MaybeAccessor<T> = T | Accessor<T>;
type RenderValue<T> = JSXRenderable | ((value: T) => JSXRenderable);

function toAccessor<T>(value: MaybeAccessor<T>): Accessor<T> {
  return typeof value === "function"
    ? (value as Accessor<T>)
    : () => value;
}

function resolveRenderValue<T>(value: RenderValue<T> | undefined, input: T): JSXRenderable {
  if (typeof value === "function" && value.length > 0) {
    return (value as (value: T) => JSXRenderable)(input);
  }

  return (value ?? null) as JSXRenderable;
}

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

function isMatchingCase<T>(candidate: T | ((value: T) => boolean), value: T): boolean {
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
