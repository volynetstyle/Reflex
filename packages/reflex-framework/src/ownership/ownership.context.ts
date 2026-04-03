import { OwnershipNode } from "./ownership.node";
import type { OwnerContext } from "./ownership.scope";

type ContextId = symbol;
type ContextTarget = OwnerContext | OwnershipNode;
const MISSING_CONTEXT = Symbol("ownership-context.missing");

export interface OwnershipContextRecord {
  readonly parent: OwnershipContextRecord | null;
  readonly values: Map<ContextId, unknown>;
}

export interface OwnershipContext<T = unknown> {
  readonly id: ContextId;
  readonly defaultValue: T | undefined;
  readonly hasDefaultValue: boolean;
}

export function createContext<T>(): OwnershipContext<T | undefined>;
export function createContext<T>(defaultValue: T): OwnershipContext<T>;
export function createContext<T>(
  defaultValue?: T,
): OwnershipContext<T | undefined> {
  return Object.freeze({
    id: Symbol("ownership-context"),
    defaultValue,
    hasDefaultValue: arguments.length !== 0,
  });
}

export function createContextLayer(
  parent: OwnershipContextRecord | null,
): OwnershipContextRecord {
  return Object.preventExtensions({
    parent,
    values: new Map<ContextId, unknown>(),
  });
}

function resolveContextTarget(target: ContextTarget): OwnershipNode | null {
  return target instanceof OwnershipNode ? target : target.currentOwner;
}

function ensureContextLayer(node: OwnershipNode): OwnershipContextRecord {
  return (node.context ??= createContextLayer(resolveParentContext(node)));
}

export function contextProvide<T>(
  ctx: OwnershipContextRecord,
  context: OwnershipContext<T>,
  value: T,
): void {
  ctx.values.set(context.id, value);
}

export function provideContext<T>(
  target: ContextTarget,
  context: OwnershipContext<T>,
  value: T,
): void {
  const scope = resolveContextTarget(target);

  if (scope === null) {
    return;
  }

  contextProvide(ensureContextLayer(scope), context, value);
}

function lookupContextValue(
  node: OwnershipNode,
  id: ContextId,
): unknown | typeof MISSING_CONTEXT {
  for (
    let current: OwnershipNode | null = node;
    current !== null;
    current = current.parent
  ) {
    const ctx = current.context;

    if (ctx !== null && ctx.values.has(id)) {
      return ctx.values.get(id);
    }
  }

  return MISSING_CONTEXT;
}

export function contextLookup<T>(
  node: OwnershipNode,
  context: OwnershipContext<T>,
): T | undefined {
  const value = lookupContextValue(node, context.id);

  if (value !== MISSING_CONTEXT) {
    return value as T;
  }

  return context.hasDefaultValue ? context.defaultValue : undefined;
}

export function useContext<T>(
  target: ContextTarget,
  context: OwnershipContext<T>,
): T | undefined {
  const scope = resolveContextTarget(target);

  if (scope === null) {
    return context.hasDefaultValue ? context.defaultValue : undefined;
  }

  return contextLookup(scope, context);
}

export function contextHasOwn(
  ctx: OwnershipContextRecord | null,
  context: OwnershipContext<unknown>,
): boolean {
  return ctx !== null && ctx.values.has(context.id);
}

export function hasOwnContext(
  target: ContextTarget,
  context: OwnershipContext<unknown>,
): boolean {
  const scope = resolveContextTarget(target);
  return scope !== null && contextHasOwn(scope.context, context);
}

export function resolveParentContext(
  node: OwnershipNode,
): OwnershipContextRecord | null {
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    const ctx = parent.context;

    if (ctx !== null) {
      return ctx;
    }
  }

  return null;
}
