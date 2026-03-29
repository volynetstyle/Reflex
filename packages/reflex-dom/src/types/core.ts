export type Accessor<T> = () => T;
export type MaybeAccessor<T> = T | Accessor<T>;

export type Cleanup = (() => void) & { dispose?: () => void };

export type AttributeKey = string | number | bigint;

export interface Attributes {
  key?: AttributeKey | null | undefined;
}

export interface RefObject<T extends Node> {
  current: T | null;
}

export type RefCallback<T extends Node> = (
  instance: T | null,
) => void | (() => void);

export type Ref<T extends Node> = RefCallback<T> | RefObject<T> | null;

export interface RefAttributes<T extends Element> extends Attributes {
  ref?: Ref<T> | undefined;
}
