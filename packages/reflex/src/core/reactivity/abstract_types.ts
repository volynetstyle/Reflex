import {
  OWNERSHIP_BRAND,
  VERSION_DEFINITION,
  WRITABLE_BRAND,
  SET_DEFINITION,
  COMPUTED_BRAND,
} from "./common_constants";

declare const LOCAL_DISPOSABLE_BRAND: unique symbol;
type Disposable = (() => void) & { [LOCAL_DISPOSABLE_BRAND]: true };

interface ISignal<T> {
  readonly [OWNERSHIP_BRAND]: true;
  readonly [VERSION_DEFINITION]: number;

  get(): T;
  subscribe(observer: (value: T) => void): Disposable;
  dispose(): void;
}

interface IWritableSignal<T> extends ISignal<T> {
  readonly [WRITABLE_BRAND]: true;
  [SET_DEFINITION](value: T | ((prev: T) => T)): void;
}

interface IComputedSignal<T> extends ISignal<T> {
  readonly [COMPUTED_BRAND]: true;
}

/**
 * An abstract class representing ownership of signals.
 * This class implements the ISignal interface and provides
 * default implementations for its methods.
 *
 * Means to mark a class as an owner of signals and track to automaticaly dispose using the `dispose` method.
 *
 * If you write the following
 *
 *   const a = createOwner(() => {
 *     const b = createOwner(() => {});
 *
 *     const c = createOwner(() => {
 *       const d = createOwner(() => {});
 *     });
 *
 *     const e = createOwner(() => {});
 *   });
 *
 * The owner tree will look like this:
 *
 *    a
 *   /|\
 *  b-c-e
 *    |
 *    d
 *
 * Following the _nextSibling pointers of each owner will first give you its children, and then its siblings (in reverse).
 * a -> e -> c -> d -> b
 *
 */
abstract class Ownership implements ISignal<unknown> {
  
}

// class SignalError extends Error {
//   constructor(message: string) {
//     super(message);
//     this.name = "SignalError";
//   }

//   static readonly NOT_WRITABLE = new SignalError("The signal is not writable.");
//   static readonly DISPOSED = new SignalError("The signal has been disposed.");
//   static readonly CIRCULAR = new SignalError(
//     "A circular dependency has been detected."
//   );
// }

export { ISignal, IWritableSignal, IComputedSignal, Disposable };
