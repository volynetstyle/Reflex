import {
  type EngineHooks,
  resetState,
  saveContext,
  setHooks,
  setOptions,
  setRuntimeHooks,
} from "../../src";

/**
 * Reset runtime-global context state, hooks, and options for test isolation.
 */
export function resetRuntime(hooks: EngineHooks = {}): void {
  resetState();
  setRuntimeHooks();
  setHooks(hooks);
  setOptions({});
}

export const saveRuntimeContext = saveContext;
