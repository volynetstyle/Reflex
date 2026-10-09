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

/**
 * Creates a unique context token with an optional default value.
 *
 * @remarks
 * **When to use:** to provide a dependency through an ownership tree without
 * threading props through every component.
 * **When not to use:** for mutable reactive state by itself; store a signal or
 * accessor in the context value when changes must notify consumers.
 *
 * @param defaultValue The value returned when no provider is found.
 * @typeParam T The context value type.
 */
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

/**
 * Sets a context value on an owner or scope so descendants can inherit it.
 *
 * @remarks
 * **When to use:** to configure a context for one ownership branch before its
 * descendants read it.
 * **When not to use:** to notify consumers when a plain value changes or
 * without an ownership target; store a signal or accessor in the context value.
 *
 * @param target The owner or scope that provides the value.
 * @param context The token created by `createContext`.
 * @param value The value to provide.
 * @typeParam T The context value type.
 */
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

/**
 * Looks up a context value for the supplied owner or scope, including inherited
 * values and the context's default value.
 *
 * @remarks
 * **When to use:** when code has an explicit ownership target and needs its
 * nearest provided value.
 * **When not to use:** as a hook without a target argument; pass an owner or
 * scope explicitly. Use `hasOwnContext` to check only the local value.
 *
 * @param target The owner or scope where lookup begins.
 * @param context The token created by `createContext`.
 * @typeParam T The context value type.
 */
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

/**
 * Checks whether a context value is set directly on an owner or scope.
 * Values inherited from ancestors do not count as local values.
 *
 * @remarks
 * **When to use:** to distinguish a local override from an inherited value.
 * **When not to use:** to check whether a value is available at all; use
 * `useContext`, which also searches ancestors and checks the default value.
 *
 * @param target The owner or scope to inspect.
 * @param context The context token.
 */
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
