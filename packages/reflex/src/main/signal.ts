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
 * Intentionally untyped prototype.
 * Assumes `this._value` exists and is valid.
 */
const UNSAFE_SIGNAL_PROTO: any = {
  get value() {
    return this._value;
  },
  set(next: any) {
    throw Error("None set setter in Signal Proto!");
  },
};

// in future initialize once and forget
UNSAFE_SIGNAL_PROTO.set = () => {};

/**
 * Creates a callable signal.
 *
 * ⚠️ `_value` is initialized as `undefined`.
 * Caller MUST set initial value manually.
 */
export function createUnsafeCallableSignal<T>(): UnsafeCallableSignal<T> {
  const s = function () {
    return s._value;
  } as UnsafeCallableSignal<T>;

  Object.setPrototypeOf(s, UNSAFE_SIGNAL_PROTO);

  // Deliberately uninitialized
  s._value = void 0 as any;

  return s;
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

export const realtime = <T>(value: T): Realtime<T> => {
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
