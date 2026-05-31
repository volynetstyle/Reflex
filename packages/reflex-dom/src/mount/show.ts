import type { Namespace } from "../host/namespace";
import type { ShowRenderable } from "../operators";
import { resolveShowValue } from "../operators";
import { mountReactiveSlot } from "./reactive";

export function mountShow(
  renderable: ShowRenderable<unknown>,
  ns: Namespace,
): Node {
  return mountReactiveSlot(
    renderable.when,
    (value) => resolveShowValue(renderable, value),
    ns,
  );
}
