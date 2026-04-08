import type { Accessor } from "../types";
import type { Namespace } from "../host/namespace";
import type { DOMRenderer } from "../runtime";
import { applyProp } from "../host/props";
import { onEffectStart, useEffect } from "reflex-framework/ownership/reflex";

export function bindReactiveProp(
  renderer: DOMRenderer,
  el: Element,
  name: string,
  acc: Accessor<unknown>,
  ns: Namespace,
) {
  let previousValue = applyProp(el, name, acc(), ns, undefined);

  useEffect(renderer.owner, () => {
    const nextValue = acc();

    onEffectStart(() => {
      previousValue = applyProp(el, name, nextValue, ns, previousValue);
    });
  });
}
