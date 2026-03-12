import ReactiveNode, {
  ReactiveRoot,
} from "../../../@reflex/runtime/src/reactivity/shape/Reactive";
import { KIND_SIGNAL } from "../../../@reflex/runtime/src/reactivity/shape/ReactiveMeta";
import {
  Signal,
  Realtime,
  Stream,
  Resource,
  Suspense,
  SignalCore,
} from "../typelevel/test";

/**
 * ⚠️ UNSAFE CALLABLE SIGNAL
 *
 * - No runtime type checks
 * - Mutable internal state
 * - Prototype-based sharing
 * - Caller is responsible for correctness
 */

export type UnsafeCallableSignal<T> = {
  (): T;
  _value: T;
  readonly value: T;
  set(next: T | ((prev: T) => T)): void;
};

/**
 * Creates a callable signal.
 *
 * ⚠️ `_value` is initialized as `undefined`.
 */
export function createUnsafeCallableSignal<T>(): UnsafeCallableSignal<T> {
  const s: any = function () {
    return s._value;
  };

  s._value = undefined;

  s.set = function (next: any) {
    if (typeof next === "function") {
      s.set = update;
      update.call(s, next);
    } else {
      s.set = set;
      set.call(s, next);
    }
  };

  Object.defineProperty(s, "value", {
    get() {
      return s._value;
    },
  });

  return s;
}

function set(this: any, v: any) {
  this._value = v;
}

function update(this: any, fn: any) {
  this._value = fn(this._value);
}

//
//  expexted result
//  1) s.value - get
//  2) s() - get
//  3) s.set(value => value)
//
//  expexted result
//  1) s.value - get
//  2) s() - get
//  3) s.set(value => value)

export const signal = <T>(initialValue: T): Signal<T> => {
  return undefined as any;
};

type RealtimeSet<T> = any;
type RealtimeMap<K, V> = any;

export const realtime = <T, K>(
  value: T,
): RealtimeSet<T> | RealtimeMap<T, K> => {
  return undefined as any;
};

export const stream = <T>(value: T): Stream<T> => {
  return undefined as any;
};

export const resource = <T>(value: T): Resource<T> => {
  return undefined as any;
};

export const suspense = <T>(value: T): Suspense<T> => {
  return undefined as any;
};
