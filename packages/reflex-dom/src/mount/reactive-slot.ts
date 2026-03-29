import type { Namespace } from "../host/namespace";
import type { Scope } from "../ownership";
import {
  onEffectStart,
  ownedEffect,
  registerCleanup,
  runWithScope,
} from "../ownership";
import type { DOMRenderer } from "../runtime";
import type { Accessor } from "../types";
import type { ContentSlot } from "../structure/content-slot";
import { createContentSlot } from "../structure/content-slot";
import { appendRenderableNodes } from "./append";

function mountNestedValue(
  renderer: DOMRenderer,
  parent: Node,
  scope: Scope,
  value: unknown,
  ns: Namespace,
): void {
  runWithScope(renderer.owner, scope, () => {
    appendRenderableNodes(renderer, parent, value, ns);
  });
}

export function createMountedSlot(
  renderer: DOMRenderer,
  value: unknown,
  ns: Namespace,
): ContentSlot {
  return createContentSlot(
    document,
    (parent, scope, nextValue) => {
      mountNestedValue(renderer, parent, scope, nextValue, ns);
    },
    value,
  );
}

export function mountReactiveSlot<T>(
  renderer: DOMRenderer,
  readValue: () => T,
  resolveValue: (value: T) => unknown,
  ns: Namespace,
): Node {
  const slot = createMountedSlot(renderer, resolveValue(readValue()), ns);

  ownedEffect(renderer.owner, () => {
    const nextValue = readValue();

    onEffectStart(() => {
      slot.update(resolveValue(nextValue));
    });
  });

  registerCleanup(renderer.owner, () => {
    slot.destroy();
  });

  return slot.fragment;
}

export function mountDynamic(
  renderer: DOMRenderer,
  acc: Accessor<unknown>,
  ns: Namespace,
): Node {
  renderer.ensureRuntime();
  return mountReactiveSlot(renderer, acc, (value) => value, ns);
}
