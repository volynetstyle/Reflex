import type { OwnershipNode } from "./ownership.node";

type ContextKeyType = string;

export interface IOwnershipContextRecord {
  [key: ContextKeyType]: unknown;
}

export interface IOwnershipContext<T = unknown> {
  readonly id: symbol;
  readonly defaultValue?: T;
}

export function createContextLayer(
  parent: IOwnershipContextRecord | null,
): IOwnershipContextRecord {
  return parent ? Object.create(parent) : Object.create(null);
}

export function contextProvide(
  ctx: IOwnershipContextRecord,
  key: ContextKeyType,
  value: unknown,
): void {
  ctx[key] = value;
}

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

export function contextHasOwn(
  ctx: IOwnershipContextRecord | null,
  key: ContextKeyType,
): boolean {
  return ctx !== null && Object.hasOwn(ctx, key);
}

export function resolveParentContext(
  node: OwnershipNode,
): IOwnershipContextRecord | null {
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    const ctx = parent.context;

    if (ctx !== null) {
      return ctx;
    }
  }

  return null;
}
