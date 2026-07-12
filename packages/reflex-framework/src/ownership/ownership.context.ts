import type { OwnershipNode } from "./ownership.node";
import type { OwnerContext } from "./ownership.scope";

type ContextTarget = OwnerContext | OwnershipNode;
const MISSING_CONTEXT = Symbol("ownership-context.missing");

export interface OwnershipContextRecord {
  readonly parent: OwnershipContextRecord | null;
  readonly values: Map<OwnershipContext<unknown>, unknown>;
}

export interface OwnershipContext<T = unknown> {
  readonly defaultValue: T | undefined;
  readonly hasDefaultValue: boolean;
}

export function createContext<T>(): OwnershipContext<T | undefined>;
export function createContext<T>(defaultValue: T): OwnershipContext<T>;
export function createContext<T>(
  defaultValue?: T,
): OwnershipContext<T | undefined> {
  return Object.freeze({
    defaultValue,
    hasDefaultValue: arguments.length !== 0,
  });
}

export function createContextLayer(
  parent: OwnershipContextRecord | null,
): OwnershipContextRecord {
  return Object.preventExtensions({
    parent,
    values: new Map<OwnershipContext<unknown>, unknown>(),
  });
}

function resolveContextTarget(target: ContextTarget): OwnershipNode | null {
  return "currentNode" in target ? target.currentNode : target;
}

function ensureContextLayer(node: OwnershipNode): OwnershipContextRecord {
  return (node.context ??= createContextLayer(resolveParentContext(node)));
}

export function contextProvide<T>(
  ctx: OwnershipContextRecord,
  context: OwnershipContext<T>,
  value: T,
): void {
  ctx.values.set(context, value);
}

export function provideContext<T>(
  target: ContextTarget,
  context: OwnershipContext<T>,
  value: T,
): void {
  const node = resolveContextTarget(target);

  if (node === null) {
    return;
  }

  contextProvide(ensureContextLayer(node), context, value);
}

function lookupContextValue(
  contextRecord: OwnershipContextRecord | null,
  context: OwnershipContext<unknown>,
): unknown | typeof MISSING_CONTEXT {
  for (
    let current = contextRecord;
    current !== null;
    current = current.parent
  ) {
    if (current.values.has(context)) {
      return current.values.get(context);
    }
  }

  return MISSING_CONTEXT;
}

export function contextLookup<T>(
  node: OwnershipNode,
  context: OwnershipContext<T>,
): T | undefined {
  const value = lookupContextValue(
    node.context ?? resolveParentContext(node),
    context,
  );

  if (value !== MISSING_CONTEXT) {
    return value as T;
  }

  return context.hasDefaultValue ? context.defaultValue : undefined;
}

export function useContext<T>(
  target: ContextTarget,
  context: OwnershipContext<T>,
): T | undefined {
  const node = resolveContextTarget(target);

  if (node === null) {
    return context.hasDefaultValue ? context.defaultValue : undefined;
  }

  return contextLookup(node, context);
}

export function contextHasOwn(
  ctx: OwnershipContextRecord | null,
  context: OwnershipContext<unknown>,
): boolean {
  return ctx !== null && ctx.values.has(context);
}

export function hasOwnContext(
  target: ContextTarget,
  context: OwnershipContext<unknown>,
): boolean {
  const node = resolveContextTarget(target);
  return node !== null && contextHasOwn(node.context, context);
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
