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
} from "../runtime/context";
import { registerDOMCleanup } from "../runtime/lifetime";
import type { Ref } from "../types";

type ElementBindingPhase = "initial" | "deferred";

export function bindElementProps(
  element: Element,
  props: Record<string, unknown>,
  namespace: Namespace,
  bindingPhase: ElementBindingPhase = "initial",
): void {
  const isSelect = isHTMLTag(element, "select");
  const deferred = bindingPhase === "deferred";
  if (deferred && !isSelect) return;

  for (const name in props) {
    switch (name) {
      case "children":
      case "key":
      case "shadowRoot":
      case "shadowChildren":
      case "shadowRootRef":
      case "shadowAdoptedStyleSheets":
      case "elementInternals":
        continue;
    }

    if (
      deferred !== (isSelect && (name === "value" || name === "selectedIndex"))
    ) {
      continue;
    }

    const value = props[name];
    if (value === undefined) continue;

    if (name === "ref") {
      registerDOMCleanup(attachRef(element, value as Ref<Element>));
    } else if (isEventProp(name, value)) {
      // The handler runs under the node that owns the listener, so resources
      // it creates close with the element's component or branch.
      registerDOMCleanup(
        attachEventListener(
          element,
          name,
          value as EventListenerOrEventListenerObject,
          dispatchDOMEvent,
          captureDOMCallbackScope(),
        ),
      );
    } else if (typeof value === "function") {
      bindReactiveProp(element, name, value as () => unknown, namespace);
    } else {
      applyProp(element, normalizeAttr(name), value, namespace, undefined);
    }
  }
}
