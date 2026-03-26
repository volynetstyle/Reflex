import { effect } from "@volynetstyle/reflex";
import type { Accessor, Cleanup } from "../types";
import type { Namespace } from "../host/namespace";
import type { DOMRenderer } from "../runtime";
import { applyProp } from "../host/props";
import { registerCleanup } from "../ownership";

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

  registerCleanup(
    renderer.owner,
    effect(() => {
      const nextValue = acc();

      if (!isInitialized) {
        isInitialized = true;
        return;
      }

      previousValue = applyProp(el, name, nextValue, ns, previousValue);
    }) as Cleanup,
  );
}
