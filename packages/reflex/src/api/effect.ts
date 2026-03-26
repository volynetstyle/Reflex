import { runWatcher, disposeWatcher, ReactiveNodeState } from "@reflex/runtime";
import { createEffectNode, UNINITIALIZED } from "../infra/factory";
import type { ReactiveNode } from "@reflex/runtime";

const EFFECT_CLEANUP_REGISTRAR = Symbol.for("reflex.effect.cleanup.register");

type CleanupRegistrar = (cleanup: Destructor) => void;

function registerOwnedEffectCleanup(cleanup: Destructor): void {
  const host = globalThis as typeof globalThis & {
    [EFFECT_CLEANUP_REGISTRAR]?: CleanupRegistrar;
  };

  host[EFFECT_CLEANUP_REGISTRAR]?.(cleanup);
}

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

export function effect(fn: EffectFn):  Destructor {
  const node = createEffectNode(fn);
  runWatcher(node);

  const dispose = () => disposeWatcher(node);
  registerOwnedEffectCleanup(dispose);
  return dispose;
}
