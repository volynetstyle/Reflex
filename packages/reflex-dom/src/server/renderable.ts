import {
  RenderableKind,
  getTaggedRenderableKind,
  isEmptyRenderableValue,
} from "../renderable-kind";

function isIterableRenderableValue(value: unknown): value is Iterable<unknown> {
  return (
    Array.isArray(value) ||
    (typeof value === "object" &&
      value !== null &&
      Symbol.iterator in value)
  );
}

function isServerNodeValue(value: unknown): value is Node {
  return typeof Node !== "undefined" && value instanceof Node;
}

function isAccessorRenderableValue(value: unknown): value is () => unknown {
  return typeof value === "function";
}

export function classifyServerRenderable(value: unknown): RenderableKind {
  if (isEmptyRenderableValue(value)) {
    return RenderableKind.Empty;
  }

  if (isIterableRenderableValue(value)) {
    return RenderableKind.Array;
  }

  if (isServerNodeValue(value)) {
    return RenderableKind.Node;
  }

  if (isAccessorRenderableValue(value)) {
    return RenderableKind.Accessor;
  }

  return getTaggedRenderableKind(value) ?? RenderableKind.Text;
}
