import {
  getCurrentHookNode,
  provideContext as provideOwnerContext,
  useContext as lookupOwnerContext,
  type OwnershipContext,
} from "@volynets/reflex-framework";
import type { JSXRenderable } from "../types";

/**
 * Reads the nearest value provided for `context` above the current component,
 * or the context's default value when no ancestor provides one.
 *
 * @remarks
 * **When to use:** in a component body or a hook called from one.
 * **When not to use:** in callbacks that run after setup, such as event
 * handlers or code after `await`; read the value during setup and capture it.
 * Integrations that hold an explicit owner use `useContext` from
 * `@volynets/reflex-framework`.
 *
 * @param context The token created by `createContext`.
 * @typeParam T The context value type.
 */
export function useContext<T>(context: OwnershipContext<T>): T {
  const node = getCurrentHookNode();

  if (__DEV__ && node === null) {
    console.warn(
      "useContext() was called without an active owner; only the default value is available.",
    );
  }

  return (
    node === null
      ? context.defaultValue
      : lookupOwnerContext(node, context)
  ) as T;
}

/**
 * Provides `value` for `context` to the descendants of the current component.
 * Siblings and ancestors are not affected.
 *
 * @remarks
 * **When to use:** during component setup, before descendants read the value.
 * **When not to use:** to publish changes; providing again does not notify
 * consumers. Provide a signal or accessor once and read it reactively.
 *
 * @param context The token created by `createContext`.
 * @param value The value descendants receive.
 * @typeParam T The context value type.
 */
export function provideContext<T>(context: OwnershipContext<T>, value: T): void {
  const node = getCurrentHookNode();

  if (node === null) {
    if (__DEV__) {
      console.warn(
        "provideContext() was called without an active owner; the value is not provided.",
      );
    }
    return;
  }

  provideOwnerContext(node, context, value);
}

/**
 * Props accepted by `Provider`.
 *
 * @typeParam T The context value type.
 */
export interface ProviderProps<T> {
  context: OwnershipContext<T>;
  /** Read once at setup; pass a signal or accessor for changing values. */
  value: T;
  children?: JSXRenderable;
}

/**
 * Provides a context value to its children without a dedicated component.
 *
 * @remarks
 * **When to use:** to scope a value to one subtree directly in JSX.
 * **When not to use:** when the providing component also needs the value;
 * call `provideContext` in its body instead.
 *
 * @param props The context token, its value and the children that receive it.
 * @typeParam T The context value type.
 */
export function Provider<T>(props: ProviderProps<T>): JSXRenderable {
  provideContext(props.context, props.value);
  return props.children;
}
