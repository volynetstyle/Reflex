import type { Accessor } from "../types";
import type { Namespace } from "../host/namespace";
import { applyProp } from "../host/props";
import { createDOMOwnedBinding } from "../runtime/lifetime";

export function bindReactiveProp(
  el: Element,
  name: string,
  acc: Accessor<unknown>,
  ns: Namespace,
) {
  let previousValue: unknown;

  createDOMOwnedBinding(acc, (nextValue) => {
    previousValue = applyProp(el, name, nextValue, ns, previousValue);
  });
}
