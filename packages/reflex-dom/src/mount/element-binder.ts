import { addCleanup } from "@volynets/reflex-framework";
import { bindReactiveProp } from "../bindings/property";
import { isEventProp, attachEventListener } from "../host/events";
import type { Namespace } from "../host/namespace";
import { applyProp } from "../host/props";
import { attachRef } from "../host/refs";
import { getDOMContext, type DOMContext } from "../runtime/context";
import { registerDOMCleanup } from "../runtime/lifetime";
import type { Ref } from "../types";

type ElementBindingPhase = "initial" | "deferred";

/** Props consumed by `mountElement` itself (Shadow DOM and internals). */
function isPlatformManagedProp(name: string): boolean {
  switch (name) {
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

function isSelectElement(element: Element, namespace: Namespace): boolean {
  return namespace === "html" && element.localName === "select";
}

function bindProperty(
  context: DOMContext,
  element: Element,
  name: string,
  value: unknown,
  namespace: Namespace,
): void {
  if (name === "ref") {
    registerDOMCleanup(
      attachRef(element, value as Ref<Element> | undefined),
      context,
    );
    return;
  }

  if (isEventProp(name, value, element)) {
    const remove = attachEventListener(
      element,
      name,
      value as EventListenerOrEventListenerObject,
      context.dispatchEvent,
    );
    // Removing a listener needs neither the DOM context nor the domain.
    const node = context.owner.currentNode;
    if (node !== null) addCleanup(node, remove);
    return;
  }

  if (typeof value === "function") {
    bindReactiveProp(element, name, value as () => unknown, namespace);
    return;
  }

  applyProp(element, name, value, namespace, undefined);
}

/** One known prop, without allocating a props object or enumerating it. */
export function bindElementProp(
  element: Element,
  name: string,
  value: unknown,
  namespace: Namespace,
): void {
  if (value === undefined || name === "children" || name === "key" || isPlatformManagedProp(name)) return;
  bindProperty(getDOMContext(), element, name, value, namespace);
}

export function bindElementProps(
  element: Element,
  props: Record<string, unknown>,
  namespace: Namespace,
  bindingPhase: ElementBindingPhase = "initial",
  isSelect: boolean = isSelectElement(element, namespace),
): void {
  const context = getDOMContext();

  const deferredPhase = bindingPhase === "deferred";

  if (deferredPhase && !isSelect) return;

  for (const name in props) {
    const value = props[name];

    if (
      value === undefined ||
      name === "children" ||
      name === "key" ||
      isPlatformManagedProp(name) ||
      deferredPhase !== (isSelect && isDeferredSelectProp(name))
    ) {
      continue;
    }

    bindProperty(context, element, name, value, namespace);
  }
}
