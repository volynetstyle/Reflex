import { IOwnershipContextRecord, ContextKeyType } from "./ownership.contract";
import type { OwnershipNode } from "./ownership.node";

/**
 * Create a new context layer inheriting from parent (if any).
 * Root contexts use null-prototype objects.
 */
export function createContextLayer(
  parent: IOwnershipContextRecord | null,
): IOwnershipContextRecord {
  return parent ? Object.create(parent) : Object.create(null);
}

/**
 * Provide a key/value pair into a context object.
 */
export function contextProvide(
  ctx: IOwnershipContextRecord,
  key: ContextKeyType,
  value: unknown,
): void {
  ctx[key] = value;
}

/**
 * Walk up the ownership chain and lookup a context value by key.
 */
export function contextLookup<T>(
  node: OwnershipNode,
  key: ContextKeyType,
): T | undefined {
  let current: OwnershipNode | null = node;

  while (current !== null) {
    const ctx = current._context;
    if (ctx !== null && key in ctx) {
      return ctx[key] as T;
    }
    current = current._parent;
  }

  return undefined;
}

/**
 * Check if key exists as an own property in the given context.
 */
export function contextHasOwn(
  ctx: IOwnershipContextRecord | null,
  key: ContextKeyType,
): boolean {
  return ctx !== null && Object.hasOwn(ctx, key);
}
