import type { Namespace } from "../host/namespace";
import type { ShowRenderable } from "../operators";
import { resolveShowValue } from "../operators";
import type { DOMRenderer } from "../runtime/renderer";
import { mountReactiveSlot } from "./reactive";

export function mountShow(
  renderer: DOMRenderer,
  renderable: ShowRenderable<unknown>,
  ns: Namespace,
): Node {
  return mountReactiveSlot(
    renderer,
    renderable.when,
    (value) => resolveShowValue(renderable, value),
    ns,
  );
}
