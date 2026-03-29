import { bindReactiveProp } from "../bindings/reactive-prop";
import { isEventProp, attachEventListener } from "../host/events";
import type { Namespace } from "../host/namespace";
import { applyProp } from "../host/props";
import { attachRef } from "../host/refs";
import { registerCleanup } from "../ownership";
import type { DOMRenderer } from "../runtime";
import type { Ref } from "../types";

const enum PropKind {
  Skip = 0,
  Ref = 1,
  Event = 2,
  Reactive = 3,
  Static = 4,
}

function isAccessor(value: unknown): value is () => unknown {
  return typeof value === "function";
}

function resolvePropKind(name: string, value: unknown): PropKind {
  if (name === "children" || name === "key" || value === undefined) {
    return PropKind.Skip;
  }

  if (name === "ref") {
    return PropKind.Ref;
  }

  if (isEventProp(name, value)) {
    return PropKind.Event;
  }

  if (isAccessor(value)) {
    return PropKind.Reactive;
  }

  return PropKind.Static;
}

export interface ElementBinder {
  readonly element: Element;
  readonly namespace: Namespace;
  bindProp(name: string, value: unknown): void;
  bindProps(props: Record<string, unknown>): void;
}

export function createElementBinder(
  renderer: DOMRenderer,
  element: Element,
  namespace: Namespace,
): ElementBinder {
  return {
    element,
    namespace,

    bindProp(name, value) {
      switch (resolvePropKind(name, value)) {
        case PropKind.Skip:
          return;

        case PropKind.Ref:
          registerCleanup(
            renderer.owner,
            attachRef(element, value as Ref<Element> | undefined),
          );
          return;

        case PropKind.Event:
          registerCleanup(
            renderer.owner,
            attachEventListener(
              element,
              name,
              value as EventListenerOrEventListenerObject,
            ),
          );
          return;

        case PropKind.Reactive:
          bindReactiveProp(renderer, element, name, value as () => unknown, namespace);
          return;

        case PropKind.Static:
          applyProp(element, name, value, namespace, undefined);
          return;
      }
    },

    bindProps(props) {
      for (const name in props) {
        this.bindProp(name, props[name]);
      }
    },
  };
}
