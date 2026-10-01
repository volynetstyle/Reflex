import { isHTMLTag } from "../host/document";
import { bindReactiveProp } from "../bindings/property";
import { isEventProp, attachEventListener } from "../host/events";
import type { Namespace } from "../host/namespace";
import { applyProp } from "../host/props";
import { attachRef } from "../host/refs";
import { dispatchDOMEvent, getDOMContext } from "../runtime/context";
import { registerDOMCleanup } from "../runtime/lifetime";
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
    isHTMLTag(element, "select") &&
    (name === "value" || name === "selectedIndex")
  );
}

function isSkippedElementProp(name: string, value: unknown): boolean {
  return name === "children" || name === "key" || value === undefined;
}

export function bindElementProperty(
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
    registerDOMCleanup(attachRef(element, value as Ref<Element> | undefined));
    return;
  }

  if (isEventProp(name, value)) {
    const context = getDOMContext();
    registerDOMCleanup(
      attachEventListener(
        element,
        name,
        value as EventListenerOrEventListenerObject,
        (handler, receiver, event) =>
          dispatchDOMEvent(context, handler, receiver, event),
      ),
    );
    return;
  }

  if (typeof value === "function") {
    bindReactiveProp(element, name, value as () => unknown, namespace);
    return;
  }

  applyProp(element, name, value, namespace, undefined);
}

export function bindElementProps(
  element: Element,
  props: Record<string, unknown>,
  namespace: Namespace,
  bindingPhase: ElementBindingPhase = "initial",
): void {
  getDOMContext();

  for (const name in props) {
    bindElementProperty(element, name, props[name], namespace, bindingPhase);
  }
}
