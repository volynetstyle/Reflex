import type { OwnershipNode } from "./ownership.node";

type ContextKeyType = string;

export interface IOwnershipContextRecord {
  [key: ContextKeyType]: unknown;
}

export interface IOwnershipContext<T = unknown> {
  readonly id: symbol;
  readonly defaultValue?: T;
}

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
  for (
    let current: OwnershipNode | null = node;
    current !== null;
    current = current.parent
  ) {
    const ctx = current.context;

    if (ctx !== null && Object.hasOwn(ctx, key)) {
      return ctx[key] as T;
    }
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

/**
 * Nearest existing context in parent chain.
 * Needed to avoid "broken inheritance" when contexts are created lazily.
 */
export function resolveParentContext(
  node: OwnershipNode,
): IOwnershipContextRecord | null {
  for (let p = node.parent; p !== null; p = p.parent) {
    const ctx = p.context;

    if (ctx !== null) {
      return ctx;
    }
  }

  return null;
}
