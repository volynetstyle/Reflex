import {
  createConsumer,
  disposeNode,
  readConsumerLazy,
} from "@volynets/reflex-runtime/internal";

export interface DisposableComputed<T> {
  readonly read: () => T;
  dispose(): void;
}

/** Owned lazy getter used by the store compiler. */
export function createDisposableComputed<T>(
  fn: () => T,
): DisposableComputed<T> {
  const node = createConsumer(fn);
  return {
    read: readConsumerLazy.bind(node) as () => T,
    dispose() {
      disposeNode(node);
    },
  };
}
