import type { Namespace } from "../host/namespace";
import type { SwitchRenderable } from "../operators";
import { resolveSwitchValue } from "../operators";
import { mountReactiveSlot } from "./reactive";

export function mountSwitch(
  renderable: SwitchRenderable<unknown>,
  ns: Namespace,
): Node {
  return mountReactiveSlot(
    renderable.value,
    (value) => resolveSwitchValue(renderable, value),
    ns,
  );
}
