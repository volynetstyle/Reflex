import { CONSUMER_INITIAL_STATE, WATCHER_INITIAL_STATE } from "../internal";
import { ReactiveNode, PRODUCER_INITIAL_STATE } from "../kernel";

export const createSignalNode = <T>(payload: T) => {
  return new ReactiveNode<T>(payload, null, PRODUCER_INITIAL_STATE);
};

export const createComputedNode = <T>(fn: () => T) => {
  const node = new ReactiveNode<T>(
    undefined as T,
    fn,
    CONSUMER_INITIAL_STATE,
  );

  return node;
};

export const createWatcherNode = (
  compute: EffectFn,
): ReactiveNode<any> => {
  return new ReactiveNode(undefined, compute, WATCHER_INITIAL_STATE);
};
