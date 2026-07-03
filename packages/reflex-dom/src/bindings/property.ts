import type { Accessor } from "../types";
import type { Namespace } from "../host/namespace";
import { applyProp } from "../host/props";
import { createDOMOwnedReaction } from "../runtime/execution";

export function bindReactiveProp(
  el: Element,
  name: string,
  acc: Accessor<unknown>,
  ns: Namespace,
) {
  let previousValue = applyProp(el, name, acc(), ns, undefined);

  createDOMOwnedReaction(acc, (nextValue) => {
    previousValue = applyProp(el, name, nextValue, ns, previousValue);
  });
}
