import {
  readProducer,
  writeProducer,
} from "@reflex/runtime";
import { unlinkAllSubscribers } from "../../../@reflex/runtime/src/reactivity/shape/methods/connect";
import { ReactiveNodeState } from "../../../@reflex/runtime/src/reactivity/shape/ReactiveMeta";
import { createScanNode, Event } from "../infra";

export function scan<T, A>(
  source: Event<T>,
  seed: A,
  reducer: (acc: A, value: T) => A,
) {
  return createScan(source, seed, reducer);
}

export function hold<T>(source: Event<T>, initial: T) {
  return createScan(source, initial, (_, value) => value);
}

function createScan<T, A>(
  source: Event<T>,
  seed: A,
  reducer: (acc: A, value: T) => A,
): [read: Accessor<A>, dispose: Destructor] {
  const node = createScanNode(seed);
  const accessor = () => readProducer(node);

  let unsubscribe: Destructor | undefined = source.subscribe((value: T) => {
    /* c8 ignore start -- disposal unsubscribes before a queued delivery can reach this callback */
    if ((node.state & ReactiveNodeState.Disposed) !== 0) return;
    /* c8 ignore stop */

    const next = reducer(node.pendingPayload, value);
    writeProducer(node, next);
  });

  function dispose(): void {
    // TODO: replace with kernel primitives
    if ((node.state & ReactiveNodeState.Disposed) !== 0) return;
    node.state |= ReactiveNodeState.Disposed;

    const stop = unsubscribe;
    unsubscribe = undefined;
    stop?.();

    unlinkAllSubscribers(node);
  }

  return [accessor, dispose];
}
