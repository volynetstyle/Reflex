import { addCleanup } from "../ownership/ownership.cleanup";
import { isShuttingDown } from "../ownership/ownership.meta";
import type { OwnershipNode } from "../ownership/ownership.node";
import { consumeHookSlot, getCurrentHookNode } from "./context";

export interface HookSlot<T> {
  disposed: boolean;
  value: T;
}

export function isHookSlotDisposed(slot: HookSlot<unknown>): boolean {
  return slot.disposed;
}

export function useHookSlot<T>(
  create: () => T,
  dispose?: (value: T) => void,
): HookSlot<T> {
  const node = getCurrentHookNode();

  if (node === null) {
    return {
      disposed: false,
      value: create(),
    };
  }

  const index = consumeHookSlot();
  let slots = node.hookSlots as HookSlot<unknown>[] | null;

  if (slots === null) {
    slots = [];
    node.hookSlots = slots;
  }

  const existing = slots[index] as HookSlot<T> | undefined;
  if (existing !== undefined && !existing.disposed) {
    return existing;
  }

  const slot: HookSlot<T> = {
    disposed: false,
    value: create(),
  };

  slots[index] = slot as HookSlot<unknown>;
  addCleanup(node, () => {
    revokeHookSlot(slot, dispose);
  });

  return slot;
}

function revokeHookSlot<T>(
  slot: HookSlot<T>,
  dispose: ((value: T) => void) | undefined,
): void {
  if (slot.disposed) return;

  slot.disposed = true;
  dispose?.(slot.value);
}

export function isCurrentHookNodeDisposed(): boolean {
  const node: OwnershipNode | null = getCurrentHookNode();
  return node !== null && isShuttingDown(node);
}
