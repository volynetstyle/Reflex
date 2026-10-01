import {
  RenderableKind,
  getTaggedRenderableKind,
  isEmptyRenderableValue,
  isTextRenderableValue,
} from "./kind";
import { isDOMNode } from "../host/document";

function isIterableRenderableValue(value: unknown): value is Iterable<unknown> {
  return (
    Array.isArray(value) ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as Iterable<unknown>)[Symbol.iterator] === "function")
  );
}

function isAccessorRenderableValue(value: unknown): value is () => unknown {
  return typeof value === "function";
}

export function classifyRenderable(value: unknown): RenderableKind {
  if (isEmptyRenderableValue(value)) {
    return RenderableKind.Empty;
  }

  if (isTextRenderableValue(value)) return RenderableKind.Text;
  if (Array.isArray(value)) return RenderableKind.Array;

  if (isDOMNode(value)) {
    return RenderableKind.Node;
  }

  if (isAccessorRenderableValue(value)) {
    return RenderableKind.Accessor;
  }

  return (
    getTaggedRenderableKind(value) ??
    (isIterableRenderableValue(value)
      ? RenderableKind.Array
      : RenderableKind.Text)
  );
}
