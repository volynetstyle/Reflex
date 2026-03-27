import type { Accessor } from "../types";
import type { Namespace } from "../host/namespace";
import type { DOMRenderer } from "../runtime";
import type { Scope } from "../ownership";
import {
  onEffectStart,
  ownedEffect,
  registerCleanup,
  runWithScope,
} from "../ownership";
import { createContentSlot } from "./content-slot";
import { appendRenderableNodes } from "../tree/create-nodes";

function mountRangeValue(
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

export function createDynamicRange(
  renderer: DOMRenderer,
  acc: Accessor<unknown>,
  ns: Namespace,
): Node {
  renderer.ensureRuntime();

  const doc = document;
  const slot = createContentSlot(
    doc,
    (parent, scope, value) => mountRangeValue(renderer, parent, scope, value, ns),
    acc(),
  );

  ownedEffect(renderer.owner, () => {
    const nextValue = acc();

    onEffectStart(() => {
      slot.update(nextValue);
    });
  });

  registerCleanup(renderer.owner, () => {
    slot.destroy();
  });

  return slot.fragment;
}
