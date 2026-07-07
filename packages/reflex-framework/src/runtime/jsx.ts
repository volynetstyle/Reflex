import { createComponentRenderable } from "../operators/component";
import { createElementRenderable } from "../operators/element";
import type { AttributeKey } from "../types/core";
import type {
  Component,
  ComponentRenderable,
  ElementRenderable,
  JSXRenderable,
} from "../types/renderable";

export const Fragment = Symbol.for("reflex.fragment");

export type FragmentType = typeof Fragment;

export type FragmentProps<Host = never> = {
  children?: JSXRenderable<Host>;
};

type JSXType<P = unknown, Host = never> =
  | string
  | FragmentType
  | Component<P, Host>;

const EMPTY_PROPS = Object.freeze({}) as Record<string, never>;

function normalizeProps<P>(props: P | null): P {
  return props ?? (EMPTY_PROPS as P);
}

export function jsx<Host = never>(
  type: FragmentType,
  props: FragmentProps<Host> | null,
  key?: AttributeKey,
): JSXRenderable<Host>;

export function jsx<
  Tag extends string,
  Props extends Record<string, unknown> = Record<string, never>,
>(
  type: Tag,
  props: Props | null,
  key?: AttributeKey,
): ElementRenderable<Tag, Props>;

export function jsx<P, Host = never>(
  type: Component<P, Host>,
  props: P | null,
  key?: AttributeKey,
): ComponentRenderable<P, Host>;

export function jsx<P, Host>(
  type: JSXType<P, Host>,
  props: P | FragmentProps<Host> | Record<string, unknown> | null,
  key?: AttributeKey,
): JSXRenderable<Host> {
  if (type === Fragment) {
    /**
     * Fragment is transparent.
     *
     * Its key is intentionally ignored unless Reflex later introduces
     * FragmentRenderable.
     */
    return props === null
      ? null
      : ((props as FragmentProps<Host>).children ?? null);
  }

  if (typeof type === "function") {
    return createComponentRenderable(type, normalizeProps(props as P), key);
  }

  return createElementRenderable(
    type,
    normalizeProps(props as Record<string, unknown>),
    key,
  );
}

export const jsxs = jsx;

export const jsxDEV: typeof jsx = jsx;
