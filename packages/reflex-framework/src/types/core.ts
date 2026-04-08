export type Accessor<T> = () => T;
export type MaybeAccessor<T> = T | Accessor<T>;

export type Cleanup = (() => void) & { dispose?: () => void };

export type AttributeKey = string | number | bigint;

export interface Attributes {
  key?: AttributeKey | null | undefined;
}
