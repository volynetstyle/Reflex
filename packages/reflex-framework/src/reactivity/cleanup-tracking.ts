import type { Cleanup } from "../types/core";
import { addCleanup } from "../ownership/ownership.cleanup";
import { isShuttingDown } from "../ownership/ownership.meta";
import { getActiveOwnerContext } from "../ownership/ownership.scope";

/** Registers cleanup produced by a public reactive API in the active scope. */
export function registerActiveOwnerCleanup(dispose: Cleanup): void {
  const scope = getActiveOwnerContext()?.currentOwner ?? null;

  if (scope === null) return;

  if (isShuttingDown(scope)) {
    dispose();
    return;
  }

  addCleanup(scope, () => {
    console.log("DEBUG public dispose");
    dispose();
  });
}
