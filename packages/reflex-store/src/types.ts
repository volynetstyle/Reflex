export type Destructor = () => void;

export type Accessor<T> = () => T;

export type DisposableAccessor<K, V> = ((key: K) => V) & {
  collect(): void;
  dispose(): void;
};
