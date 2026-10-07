import {
  LifecycleScope,
  type DisposableResource,
  type Synchronous,
} from "@volynets/reflex-framework";
import { batch } from "@volynets/reflex";
import {
  currentConsumer,
  setCurrentConsumer,
  untracked,
} from "@volynets/reflex-runtime/internal";

import type { StoreCell } from "./cell";

type AnyFunction = (...args: never[]) => unknown;

export interface StoreScope {
  readonly disposed: boolean;
  readonly signal: AbortSignal;
  own<T extends DisposableResource>(resource: T): T;
  action<F extends AnyFunction>(callback: Synchronous<F>): F;
  writer<T>(cell: StoreCell<T>): (value: T) => T;
}

export type StoreScopeValue<T extends object> = T &
  DisposableResource & {
    dispose(): void;
  };

/** Compiler lifetime and mutation boundary over the shared framework lifecycle. */
export function createStoreScope<T extends object>(
  setup: (scope: StoreScope) => T,
): StoreScopeValue<T> {
  const lifecycle = new LifecycleScope((fn) => batch(() => untracked(fn)));
  const assertOpen = () => {
    if (lifecycle.disposed)
      throw new Error("Cannot use a disposed compiled store scope");
  };
  const scope: StoreScope = {
    get disposed() {
      return lifecycle.disposed;
    },
    get signal() {
      return lifecycle.signal;
    },
    own(resource) {
      assertOpen();
      return lifecycle.use(resource);
    },
    writer<T>(cell: StoreCell<T>): (value: T) => T {
      assertOpen();
      let pending!: T;
      const commit = () => {
        const previous = currentConsumer;
        setCurrentConsumer(null);
        try {
          cell.set(pending);
        } finally {
          setCurrentConsumer(previous);
        }
      };
      return (value) => {
        assertOpen();
        if (Object.is(cell.peek(), value)) return value;
        const previous = pending;
        pending = value;
        try {
          batch(commit);
          return value;
        } finally {
          pending = previous;
        }
      };
    },
    action<F extends AnyFunction>(callback: Synchronous<F>): F {
      assertOpen();
      if (Object.prototype.toString.call(callback) === "[object AsyncFunction]")
        throw new TypeError("Store actions require a synchronous callback");
      return function (this: unknown, ...args: Parameters<F>): ReturnType<F> {
        assertOpen();
        return batch(() =>
          untracked(() => {
            const result = Reflect.apply(callback, this, args) as ReturnType<F>;
            if (
              result !== null &&
              (typeof result === "object" || typeof result === "function") &&
              typeof Reflect.get(result, "then") === "function"
            )
              throw new TypeError("Store actions cannot return a promise");
            return result;
          }),
        );
      } as F;
    },
  };
  try {
    const value = setup(scope);
    const dispose = () => lifecycle.dispose();
    return Object.defineProperties(value, {
      dispose: { value: dispose },
      [Symbol.dispose]: { value: dispose },
    }) as StoreScopeValue<T>;
  } catch (cause) {
    return lifecycle.rollback(cause);
  }
}
