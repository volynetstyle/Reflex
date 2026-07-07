import type { AttributeKey } from "src/types/core";
import {
  ELEMENT_RENDERABLE,
  type ElementRenderable,
} from "../types/renderable";

export { ELEMENT_RENDERABLE };

export function createElementRenderable<Tag extends string, Props>(
  tag: Tag,
  props: Props,
  key?: AttributeKey,
): ElementRenderable<Tag, Props> {
  return {
    kind: ELEMENT_RENDERABLE,
    tag,
    props,
    key: key ?? null,
  };
}
