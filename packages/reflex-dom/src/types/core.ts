import type { Attributes } from "reflex-framework";

export type {
  Accessor,
  AttributeKey,
  Attributes,
  Cleanup,
  MaybeAccessor,
} from "reflex-framework";

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
