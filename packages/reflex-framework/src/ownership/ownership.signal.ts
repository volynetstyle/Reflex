/// <reference lib="dom" preserve="true" />

// AbortController is a web-platform primitive also provided by Node. TypeScript
// declares it in lib.dom; no document or renderer is involved in this module.
import { addCleanup } from "./ownership.cleanup";
import { isShuttingDown } from "./ownership.meta";
import type { OwnershipNode } from "./ownership.node";

const controllers = new WeakMap<OwnershipNode, AbortController>();

/**
 * One lazily allocated signal per owner. Closing the owner aborts the signal;
 * requesting it after closure returns the same, already aborted signal.
 * The supplied node defines the lifetime: a component, a resource scope, or an
 * execution node belonging to one effect run.
 */
export function getLifetimeSignal(node: OwnershipNode): AbortSignal {
  let controller = controllers.get(node);
  if (controller === undefined) {
    controller = new AbortController();
    controllers.set(node, controller);
    const lifetime = controller;
    addCleanup(node, () => lifetime.abort());
  }
  if (isShuttingDown(node)) controller.abort();
  return controller.signal;
}
