import type { Namespace } from "../host/namespace";
import type { SwitchRenderable } from "../operators";
import { resolveSwitchValue } from "../operators";
import type { DOMRenderer } from "../runtime";
import { mountReactiveSlot } from "./reactive";

export function mountSwitch(
  renderer: DOMRenderer,
  renderable: SwitchRenderable<unknown>,
  ns: Namespace,
): Node {
  return mountReactiveSlot(
    renderer,
    renderable.value,
    (value) => resolveSwitchValue(renderable, value),
    ns,
  );
}
