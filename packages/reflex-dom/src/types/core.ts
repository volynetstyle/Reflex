import type { Attributes } from "@volynets/reflex-framework";

export type {
  Accessor,
  AttributeKey,
  Attributes,
  Cleanup,
  MaybeAccessor,
} from "@volynets/reflex-framework";

/** A mutable ref holder; changing `current` does not notify reactive computations. */
export interface RefObject<T> {
  /** Current referenced value, or `null` before a DOM node is attached. */
  current: T | null;
}

/** Callback form of a DOM ref. It may return cleanup for the attached instance. */
export type RefCallback<T> = (instance: T | null) => void | (() => void);

/** A DOM ref callback, ref object, or `null`. */
export type Ref<T> = RefCallback<T> | RefObject<T> | null;

/** Framework attributes with an optional ref to a specific `Element` type. */
export interface RefAttributes<T extends Element> extends Attributes {
  /** Ref forwarded to the target element. */
  ref?: Ref<T> | undefined;
}
