import type { Namespace } from "../host/namespace";
import {
  createScope,
} from "@volynets/reflex-framework";
import {
  runInDOMOwnershipScope,
  runWithDOMComponentHooks,
} from "../runtime/execution";
import type { ComponentRenderable } from "../types";
import { appendRenderableNodes } from "./append";

export function mountComponent(
  parent: Node,
  renderable: ComponentRenderable<unknown>,
  ns: Namespace,
): void {
  runInDOMOwnershipScope(createScope(), () => {
    appendRenderableNodes(
      parent,
      runWithDOMComponentHooks(() => renderable.type(renderable.props)),
      ns,
    );
  });
}
