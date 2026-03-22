import {
  createSignalNode,
  readProducer,
  writeProducer,
} from "../../../@reflex/runtime/dist/esm";
import { Setter } from "../typelevel/main";
import { Stream, Resource, Suspense } from "../typelevel/test";

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
  readonly payload: T;
  set(next: T | ((prev: T) => T)): void;
  untracked(): T;
};

//
//  expexted result
//  2) s() - get
//  3) s.set(value => value)
//
//  expexted result
//  2) s() - get
//  3) s.set(value => value)
export function signal<T>(initialValue: T) {
  const node = createSignalNode(initialValue);

  const s = function (): T {
    return readProducer(node);
  };

  s.set = function (next: T | Setter<T>): void {
    const prev = node.payload,
      setted = typeof next !== "function" ? next : (next as Setter<T>)(prev);

    writeProducer(node, setted);
  };

  s.untracked = function (): T {
    return node.payload;
  };

  return s;
}

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
