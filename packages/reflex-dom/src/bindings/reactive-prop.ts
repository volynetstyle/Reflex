import { effect } from "@volynetstyle/reflex";
import type { Accessor } from "../types";
import type { Namespace } from "../host/namespace";
import type { DOMRenderer } from "../runtime";
import { applyProp } from "../host/props";

export function bindReactiveProp(
  renderer: DOMRenderer,
  el: Element,
  name: string,
  acc: Accessor<unknown>,
  ns: Namespace,
) {
  renderer.ensureRuntime();

  let previousValue = applyProp(el, name, acc(), ns, undefined);
  let isInitialized = false;

  effect(() => {
    const nextValue = acc();

    if (!isInitialized) {
      isInitialized = true;
      return;
    }

    previousValue = applyProp(el, name, nextValue, ns, previousValue);
  });
}
