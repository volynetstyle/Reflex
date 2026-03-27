import {
  runWatcher,
  disposeWatcher,
  ReactiveNodeState,
  runtime,
} from "@reflex/runtime";
import type { UNINITIALIZED } from "../infra/factory";
import { createEffectNode } from "../infra/factory";
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
  return runtime.withCleanupRegistrar(registrar, fn);
}

export function effect(fn: EffectFn): Destructor {
  const node = createEffectNode(fn);
  runWatcher(node);

  const dispose = () => disposeWatcher(node);
  runtime.registerEffectCleanup(dispose);
  return dispose;
}
