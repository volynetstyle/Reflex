import type { Attributes } from "reflex-framework";

export type {
  Accessor,
  AttributeKey,
  Attributes,
  Cleanup,
  MaybeAccessor,
} from "reflex-framework";

export interface RefObject<T> {
  current: T | null;
}

export type RefCallback<T> = (
  instance: T | null,
) => void | (() => void);

export type Ref<T> = RefCallback<T> | RefObject<T> | null;

export interface RefAttributes<T extends Element> extends Attributes {
  ref?: Ref<T> | undefined;
}
