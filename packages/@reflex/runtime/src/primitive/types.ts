/**
 * @file graph.types.ts
 *
 * Runtime definitions for the Reflex reactive graph.
 */
export type IObserverFn = () => void;

export type Accessor<T> = {
  (): T;
  value: T;
  set: Setter<T>;
};

// Универсальный Setter: value или функция (prev => value)
export type Setter<T = unknown> = <U extends T>(
  value: U | ((prev: T) => U),
) => U;

// Signal — просто кортеж [get, set]
export type Signal<T> = [value: Accessor<T>, setValue: Setter<T>];
