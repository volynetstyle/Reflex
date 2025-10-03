import type { IOwnership, IOwnershipContext } from "./ownership.type";

/**
 * Creates a new ownership context.
 * Each context has a unique symbol and optional default value.
 *
 * @template T - Type of the context value.
 * @param defaultValue - Optional default value for the context.
 * @param description - Optional description for debugging purposes.
 * @returns A new IOwnershipContext instance.
 */
export const createContext = <T>(
  defaultValue?: T,
  description?: string
): IOwnershipContext<T> => ({
  id: Symbol(description),
  defaultValue,
});

/**
 * Checks if a given owner has a value for the specified context.
 *
 * @template T - Type of the context value.
 * @param context - The context to check for.
 * @param owner - Optional owner to check against. Defaults to undefined.
 * @returns True if the owner has a value for the context, false otherwise.
 */
export const hasContext = <T>(
  context: IOwnershipContext<T>,
  owner?: IOwnership
): boolean => !!owner?._context?.[context.id];

/**
 * Retrieves the value of a context from an owner.
 *
 * If the owner does not have the context set, the default value is returned.
 *
 * @template T - Type of the context value.
 * @param context - The context to retrieve.
 * @param owner - Optional owner to get the context from. Defaults to undefined.
 * @returns The context value or its default.
 */
export const getContext = <T>(
  context: IOwnershipContext<T>,
  owner?: IOwnership
): T | undefined =>
  (owner?._context?.[context.id] as T | undefined) ?? context.defaultValue;

/**
 * Sets the value of a context on a specific owner.
 *
 * Creates a new prototype-based _context object if it doesn't exist or is the prototype itself,
 * allowing safe shadowing for child owners without affecting parent owners.
 *
 * @template T - Type of the context value.
 * @param context - The context to set.
 * @param value - The value to assign to the context.
 * @param owner - The owner on which to set the context value.
 */
export const setContext = <T>(
  context: IOwnershipContext<T>,
  value: T,
  owner?: IOwnership
) => {
  if (!owner) return;

  // Ensure prototype-based inheritance for child owners
  if (!owner._context || !Object.getPrototypeOf(owner._context)) {
    owner._context = Object.create(owner._context ?? null);
  }

  // Assign the context value
  (owner._context ??= {})[context.id] = value;
};
