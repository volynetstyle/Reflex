import type { OwnerContext } from "@volynets/reflex-framework";
import type { DOMRuntimeOptions, RuntimeInstance } from "../options";
import type { DOMRenderEffectScheduler } from "../render-effect-scheduler";
import type { MountedRootStore } from "../root-store";

export const DOM_EXECUTION_CONTEXT_BRAND: unique symbol = Symbol(
  "DOMExecutionContext",
);

export interface DOMExecutionContext {
  readonly [DOM_EXECUTION_CONTEXT_BRAND]: true;
  runtime: RuntimeInstance | null;
  options: DOMRuntimeOptions | undefined;
  owner: OwnerContext;
  mountedRoots: MountedRootStore;
  renderEffectScheduler: DOMRenderEffectScheduler;
}
