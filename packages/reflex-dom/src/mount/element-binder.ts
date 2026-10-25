import { isHTMLTag } from "../host/document";
import { bindReactiveProp } from "../bindings/property";
import { isEventProp, attachEventListener } from "../host/events";
import type { Namespace } from "../host/namespace";
import { applyProp } from "../host/props";
import { normalizeAttr } from "../host/aliases";
import { attachRef } from "../host/refs";
import {
  captureDOMCallbackScope,
  dispatchDOMEvent,
  getDOMContext,
  type DOMContext,
} from "../runtime/context";
import { registerDOMCleanup } from "../runtime/lifetime";
import type { Ref } from "../types";

type ElementBindingPhase = "initial" | "deferred";

/** Props consumed by `mountElement` itself (Shadow DOM and internals). */
function isPlatformManagedProp(name: string): boolean {
  switch (name) {
    case "children":
    case "key":
    case "shadowRoot":
    case "shadowChildren":
    case "shadowRootRef":
    case "shadowAdoptedStyleSheets":
    case "elementInternals":
      return true;
    default:
      return false;
  }
}

/**
 * `<select>` value props are bound after the options exist: assigning them
 * earlier would select nothing.
 */
function isDeferredSelectProp(name: string): boolean {
  return name === "value" || name === "selectedIndex";
}

function bindProperty(
  context: DOMContext,
  element: Element,
  name: string,
  value: unknown,
  namespace: Namespace,
): void {
  if (name === "ref") {
    registerDOMCleanup(attachRef(element, value as Ref<Element>), context);
  } else if (isEventProp(name, value, element)) {
    // The handler runs under the node that owns the listener, so resources
    // it creates close with the element's component or branch.
    registerDOMCleanup(
      attachEventListener(
        element,
        name,
        value as EventListenerOrEventListenerObject,
        dispatchDOMEvent,
        captureDOMCallbackScope(context),
      ),
      context,
    );
  } else if (typeof value === "function") {
    bindReactiveProp(element, name, value as () => unknown, namespace);
  } else {
    applyProp(element, normalizeAttr(name), value, namespace, undefined);
  }
}

/** One known prop, without allocating a props object or enumerating it. */
export function bindElementProp(
  element: Element,
  name: string,
  value: unknown,
  namespace: Namespace,
): void {
  if (value === undefined || isPlatformManagedProp(name)) return;
  bindProperty(getDOMContext(), element, name, value, namespace);
}

export function bindElementProps(
  element: Element,
  props: Record<string, unknown>,
  namespace: Namespace,
  bindingPhase: ElementBindingPhase = "initial",
  isSelect: boolean = isHTMLTag(element, "select"),
): void {
  const deferred = bindingPhase === "deferred";
  if (deferred && !isSelect) return;

  const context = getDOMContext();

  for (const name in props) {
    if (isPlatformManagedProp(name)) continue;
    if (deferred !== (isSelect && isDeferredSelectProp(name))) continue;

    const value = props[name];
    if (value === undefined) continue;

    bindProperty(context, element, name, value, namespace);
  }
}
