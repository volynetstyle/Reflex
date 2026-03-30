import {
  runWatcher,
  disposeWatcher,
  ReactiveNodeState,
  getDefaultContext,
} from "@reflex/runtime";
import type { UNINITIALIZED } from "../infra/factory";
import { createWatcherNode } from "../infra/factory";
import type { ReactiveNode } from "@reflex/runtime";

export function effectScheduled(
  node: ReactiveNode<typeof UNINITIALIZED | Destructor>,
) {
  node.state |= ReactiveNodeState.Scheduled;
}

export function effectUnscheduled(
  node: ReactiveNode<typeof UNINITIALIZED | Destructor>,
) {
  node.state &= ~ReactiveNodeState.Scheduled;
}

export type EffectCleanupRegistrar = (cleanup: Destructor) => void;

export function withEffectCleanupRegistrar<T>(
  registrar: EffectCleanupRegistrar | null,
  fn: () => T,
): T {
  const context = getDefaultContext();
  return context.withCleanupRegistrar(registrar, fn);
}

export function effect(fn: EffectFn): Destructor {
  const node = createWatcherNode(fn);
  const context = getDefaultContext();
  runWatcher(node, context);

  const dispose = () => disposeWatcher(node);
  context.registerEffectCleanup(dispose);
  return dispose;
}
