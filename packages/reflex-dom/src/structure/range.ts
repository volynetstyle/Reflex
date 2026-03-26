import { effect } from "@volynetstyle/reflex";
import type { Accessor } from "../types";
import type { Namespace } from "../host/namespace";
import type { DOMRenderer } from "../runtime";
import { clearBetween } from "../host/mutations";
import {
  createScope,
  disposeScope,
  registerCleanup,
  runWithScope,
  Scope,
} from "../ownership";
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
  const start = doc.createComment("");
  const end = doc.createComment("");

  let childScope = createScope();
  let initialized = false;

  const initialFragment = doc.createDocumentFragment();
  initialFragment.appendChild(start);
  mountRangeValue(renderer, initialFragment, childScope, acc(), ns);
  initialFragment.appendChild(end);

  effect(() => {
    const nextValue = acc();

    if (!initialized) {
      initialized = true;
      return;
    }

    const parent = end.parentNode;
    if (parent === null) {
      return;
    }

    disposeScope(childScope);
    clearBetween(start, end);

    childScope = createScope();

    const fragment = parent.ownerDocument!.createDocumentFragment();
    mountRangeValue(renderer, fragment, childScope, nextValue, ns);
    parent.insertBefore(fragment, end);
  });

  registerCleanup(renderer.owner, () => {
    disposeScope(childScope);
  });

  return initialFragment;
}
