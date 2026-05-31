import {
  type RuntimeHostHooks,
  resetState,
  saveContext,
  setHostHooks,
  setRuntimeContextOptions,
  setInternalHooks,
} from "../../../src/internal";

/**
 * Reset runtime-global context state, hooks, and options for test isolation.
 */
export function resetRuntime(hooks: RuntimeHostHooks = {}): void {
  resetState();
  setInternalHooks();
  setHostHooks(hooks);
  setRuntimeContextOptions({});
}

export const saveRuntimeContext = saveContext;
