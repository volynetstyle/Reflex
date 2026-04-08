import { bindReactiveProp } from "../bindings/property";
import { isEventProp, attachEventListener } from "../host/events";
import type { Namespace } from "../host/namespace";
import { applyProp } from "../host/props";
import { attachRef } from "../host/refs";
import { registerCleanup } from "reflex-framework/ownership";
import type { DOMRenderer } from "../runtime";
import type { Ref } from "../types";

type ElementBindingPhase = "initial" | "deferred";

function isPlatformManagedProp(name: string): boolean {
  return (
    name === "shadowRoot" ||
    name === "shadowChildren" ||
    name === "shadowRootRef" ||
    name === "shadowAdoptedStyleSheets" ||
    name === "elementInternals"
  );
}

function shouldBindPropAfterChildren(element: Element, name: string): boolean {
  return (
    element instanceof HTMLSelectElement &&
    (name === "value" || name === "selectedIndex")
  );
}

function isSkippedElementProp(name: string, value: unknown): boolean {
  return name === "children" || name === "key" || value === undefined;
}

export function bindElementProperty(
  renderer: DOMRenderer,
  element: Element,
  name: string,
  value: unknown,
  namespace: Namespace,
  bindingPhase: ElementBindingPhase = "initial",
): void {
  if (isSkippedElementProp(name, value)) {
    return;
  }

  if (isPlatformManagedProp(name)) {
    return;
  }

  const bindAfterChildren = shouldBindPropAfterChildren(element, name);
  if ((bindingPhase === "deferred") !== bindAfterChildren) {
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
  bindingPhase: ElementBindingPhase = "initial",
): void {
  for (const name in props) {
    bindElementProperty(
      renderer,
      element,
      name,
      props[name],
      namespace,
      bindingPhase,
    );
  }
}
