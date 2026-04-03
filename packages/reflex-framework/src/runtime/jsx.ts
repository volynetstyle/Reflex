import { createComponentRenderable } from "../operators/component";
import { createElementRenderable } from "../operators/element";
import type { AttributeKey } from "../types/core";
import type { Component, JSXRenderable } from "../types/renderable";

type FragmentProps<Host = never> = {
  children?: JSXRenderable<Host>;
};

type RuntimeComponent = (props: unknown) => JSXRenderable<unknown>;

export const Fragment = Symbol.for("reflex.fragment");

export function jsx(
  type: typeof Fragment,
  props: FragmentProps | null,
  _key?: AttributeKey,
): JSXRenderable;
export function jsx<Tag extends string, Props extends Record<string, unknown>>(
  type: Tag,
  props: Props | null,
  _key?: AttributeKey,
): JSXRenderable;
export function jsx<P, Host>(
  type: Component<P, Host>,
  props: P | null,
  _key?: AttributeKey,
): JSXRenderable<Host>;
export function jsx(
  type: string | typeof Fragment | RuntimeComponent,
  props: Record<string, unknown> | FragmentProps | null,
  _key?: unknown,
): JSXRenderable {
  const p = props ?? {};

  if (type === Fragment) {
    return (p as FragmentProps).children ?? null;
  }

  if (typeof type === "function") {
    return createComponentRenderable(type, p);
  }

  return createElementRenderable(type, p);
}

export const jsxs = jsx;
export const jsxDEV: typeof jsx = (
  type: string | typeof Fragment | RuntimeComponent,
  props: Record<string, unknown> | FragmentProps | null,
  key?: unknown,
) => jsx(type as never, props as never, key as AttributeKey | undefined);
