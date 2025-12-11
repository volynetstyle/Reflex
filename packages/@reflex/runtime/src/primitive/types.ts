/**
 * @file graph.types.ts
 *
 * Runtime definitions for the Reflex reactive graph.
 */
type IObserverFn = () => void;

interface IReactiveValue<T = unknown> {
  (): T;
  (next: T | ((prev: T) => T)): void;
  get(): T;
  set(next: T | ((prev: T) => T)): void;
}

export type { IObserverFn, IReactiveValue };
