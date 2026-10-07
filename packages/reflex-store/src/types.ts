/// <reference lib="esnext.disposable" />

import { setStoreName } from "./internal/names";

export interface StoreDisposable {
  [Symbol.dispose](): void;
}

export function withDispose<T extends { dispose(): void }>(
  resource: T,
  name?: string,
): T & StoreDisposable {
  setStoreName(resource, name);
  Object.defineProperty(resource, Symbol.dispose, {
    configurable: true,
    value: () => resource.dispose(),
  });
  return resource as T & StoreDisposable;
}

export type Destructor = () => void;

export type Accessor<T> = () => T;

export type DisposableAccessor<K, V> = ((key: K) => V) &
  StoreDisposable & {
    collect(): void;
    dispose(): void;
  };
