export type Destructor = () => void;
export type Accessor<T> = () => T;
export type AnyFn = (...args: never[]) => unknown;
export type EffectFn = () => void | Destructor;
export interface EffectOptions {
  priority?: number;
}
export type DirectValue<T> = T extends AnyFn ? never : T;
export type Updater<T> = (previous: T) => T;
export type SetInput<T> = DirectValue<T> | Updater<T>;
export type Setter<T> = undefined extends T
  ? { (): T; (input: SetInput<T>): T }
  : { (input: SetInput<T>): T };
export interface ValueReadable<T> {
  readonly value: T;
}
export interface Writable<T> {
  set: Setter<T>;
}
export interface Disposable {
  (): void;
}
export interface SymbolDisposable {
  [Symbol.dispose](): void;
}
export type Readable<T> = Accessor<T> & ValueReadable<T>;
export type WritableReadable<T> = Readable<T> & Writable<T>;
export type Signal<T> = Accessor<T> & Writable<T>;
export type Computed<T> = Readable<T>;
export type Memo<T> = Readable<T>;
export type Derived<T> = Readable<T>;
export type Effect<T = void> = Readable<T> &
  Disposable &
  Partial<SymbolDisposable>;
export type Scan<T> = Readable<T> & Disposable & Partial<SymbolDisposable>;
export type Realtime<T> = WritableReadable<T> & {
  subscribe(callback: () => void): () => void;
};
export type Stream<T> = WritableReadable<T> & AsyncIterable<T>;
export type ReadableLike<T> =
  | Signal<T>
  | Computed<T>
  | Memo<T>
  | Derived<T>
  | Realtime<T>
  | Stream<T>;
export type WritableLike<T> = Signal<T> | Realtime<T> | Stream<T>;
export type ValueOf<T> =
  T extends Accessor<infer V>
    ? V
    : T extends ValueReadable<infer V>
      ? V
      : never;
