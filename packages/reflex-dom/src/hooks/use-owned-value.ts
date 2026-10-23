import {
  createOwnedComputed,
  createOwnedSignal,
  getCurrentHookNode,
  getCurrentHookOwner,
  lease,
  transfer,
  type OwnedSignal,
  type OwnedValue,
} from "@volynets/reflex-framework";

function requireNode(hookName: string) {
  const node = getCurrentHookNode();
  if (node === null) {
    throw new Error(`${hookName}() needs an active owner.`);
  }
  return node;
}

/**
 * Creates a signal owned by the current component. It is released when the
 * component closes, unless a descendant or a leaseholder still needs it.
 *
 * @remarks
 * **When to use:** for state shared with consumers that may outlive or move
 * away from its creator; reads from scopes the owner does not outlive throw
 * `BorrowError` instead of reading a released value.
 * **When not to use:** for ordinary component state; use `useSignal`. The
 * result reads with `value()` and writes with `value.set(next)`.
 *
 * @param initial The initial value.
 * @typeParam T The value type.
 */
export function useOwnedSignal<T>(initial: T): OwnedSignal<T> {
  requireNode("useOwnedSignal");
  return createOwnedSignal(getCurrentHookOwner(), initial);
}

/**
 * Creates a computed value owned by the current component, with the same
 * lifetime and read rules as `useOwnedSignal`.
 *
 * @param compute Derives the value.
 * @typeParam T The value type.
 */
export function useOwnedComputed<T>(compute: () => T): OwnedValue<T> {
  requireNode("useOwnedComputed");
  return createOwnedComputed(getCurrentHookOwner(), compute);
}

/**
 * Lets the current component read `handle` and keeps it alive until the
 * component closes, even if its owner closes first.
 *
 * @param handle A value from `useOwnedSignal` or `useOwnedComputed`.
 * @returns A function that ends the lease early.
 */
export function useLease(handle: OwnedValue<unknown>): () => void {
  return lease(handle, requireNode("useLease"));
}

/**
 * Moves ownership of `handle` to the current component; its previous owner
 * closing no longer releases it. Both owners must share an execution domain.
 *
 * @param handle A value from `useOwnedSignal` or `useOwnedComputed`.
 */
export function useTransfer(handle: OwnedValue<unknown>): void {
  requireNode("useTransfer");
  transfer(handle, getCurrentHookOwner());
}
