import {
  getCurrentHookNode,
  getCurrentHookOwner,
  type PortEndpoint,
} from "@volynets/reflex-framework";

/**
 * Describes the current component as one side of a `createPort` connection:
 * its application's execution domain and its ownership node, whose disposal
 * closes the port.
 *
 * @remarks
 * **When to use:** to exchange snapshots between two applications created by
 * `createApp`; publish on the source side and read `port.read()` on the target.
 * **When not to use:** within one application; share signals or context.
 */
export function usePortEndpoint(): PortEndpoint {
  const domain = getCurrentHookOwner().domain;
  if (domain == null) {
    throw new Error("usePortEndpoint() needs an active DOM application.");
  }
  return { domain, node: getCurrentHookNode() };
}
