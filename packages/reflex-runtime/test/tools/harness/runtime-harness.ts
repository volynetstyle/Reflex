import {
  type RuntimeHostHooks,
  resetRuntimeContext,
  configureRuntimeContext,
} from "../../../src/internal";

/**
 * Reset runtime-global context state, hooks, and options for test isolation.
 */
export function resetRuntime(hooks: RuntimeHostHooks = {}): void {
  resetRuntimeContext();
  configureRuntimeContext({ hooks });
}
