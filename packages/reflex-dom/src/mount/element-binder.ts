import { bindReactiveProp } from "../bindings/property";
import { isEventProp, attachEventListener } from "../host/events";
import type { Namespace } from "../host/namespace";
import { applyProp } from "../host/props";
import { attachRef } from "../host/refs";
import { registerCleanup } from "reflex-framework/ownership";
import type { DOMRenderer } from "../runtime";
import type { Ref } from "../types";

function bindElementProp(
  renderer: DOMRenderer,
  element: Element,
  name: string,
  value: unknown,
  namespace: Namespace,
): void {
  if (name === "children" || name === "key" || value === undefined) {
    return;
  }

  if (name === "ref") {
    registerCleanup(
      renderer.owner,
      attachRef(element, value as Ref<Element> | undefined),
    );
    return;
  }

  if (isEventProp(name, value)) {
    registerCleanup(
      renderer.owner,
      attachEventListener(
        element,
        name,
        value as EventListenerOrEventListenerObject,
      ),
    );
    return;
  }

  if (typeof value === "function") {
    bindReactiveProp(renderer, element, name, value as () => unknown, namespace);
    return;
  }

  applyProp(element, name, value, namespace, undefined);
}

export function bindElementProps(
  renderer: DOMRenderer,
  element: Element,
  props: Record<string, unknown>,
  namespace: Namespace,
): void {
  for (const name in props) {
    bindElementProp(renderer, element, name, props[name], namespace);
  }
}
