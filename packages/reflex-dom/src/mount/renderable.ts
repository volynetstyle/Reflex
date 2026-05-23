import {
  RenderableKind,
  getTaggedRenderableKind,
  isEmptyRenderableValue,
} from "../renderable/kind";
import type { JSXRenderable, RenderableRecord } from "../types";

export type Renderable = JSXRenderable | unknown;
export type JSXElement = JSXRenderable;
export type InternalRenderable = RenderableRecord;

function isIterableRenderableValue(value: unknown): value is Iterable<unknown> {
  return (
    Array.isArray(value) ||
    (typeof value === "object" &&
      value !== null &&
      Symbol.iterator in value)
  );
}

function isClientNodeValue(value: unknown): value is Node {
  return value instanceof Node;
}

function isAccessorRenderableValue(value: unknown): value is () => unknown {
  return typeof value === "function";
}

export function classifyClientRenderable(value: unknown): RenderableKind {
  if (isEmptyRenderableValue(value)) {
    return RenderableKind.Empty;
  }

  if (isIterableRenderableValue(value)) {
    return RenderableKind.Array;
  }

  if (isClientNodeValue(value)) {
    return RenderableKind.Node;
  }

  if (isAccessorRenderableValue(value)) {
    return RenderableKind.Accessor;
  }

  return getTaggedRenderableKind(value) ?? RenderableKind.Text;
}
