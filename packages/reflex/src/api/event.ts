/**
 * @remarks
 * `reducer` must be a pure event reducer.
 *
 * It should only derive the next accumulator state from:
 * - the previous accumulated state
 * - the current event value
 *
 * Do not read signals, computeds, or other reactive values inside `reducer`.
 * `scan` is driven exclusively by event deliveries and does not track reactive
 * dependencies read during reduction.
 *
 * If you need to combine event-driven state with reactive state, first derive
 * the event accumulator with `scan`, then combine it outside via `computed`.
 *
 * @example
 * ```ts
 * const [count] = scan(clicks, 0, (acc) => acc + 1);
 * const doubled = computed(() => count() * multiplier());
 * ```
 */
import {
  disposeNode,
  disposeNodeEvent,
  isDisposedNode,
  readProducer,
  writeProducer,
} from "@reflex/runtime";
import { createAccumulator, Event } from "../infra";

/**
 * Creates an accumulator derived from an event stream.
 *
 * `scan` listens to `source` and applies `reducer` to the current accumulated
 * state and each incoming event value. The result becomes the next stored state.
 *
 * It is analogous to `Array.prototype.reduce`, but for a stream of events over time.
 *
 * @typeParam T - Event payload type.
 * @typeParam A - Accumulator state type.
 *
 * @param source - Event source to subscribe to.
 * @param seed - Initial accumulator state used before the first event arrives.
 * @param reducer - Pure function that receives the current accumulated state and
 * the next event value, and returns the next accumulated state.
 *
 * @returns A tuple:
 * - `read` - accessor that returns the current accumulated state.
 * - `dispose` - destructor that unsubscribes from the source and disposes the internal node.
 *
 * @example
 * ```ts
 * const rt = createRuntime();
 * const increments = rt.event<number>();
 *
 * const [total, dispose] = scan(increments, 0, (acc, value) => acc + value);
 *
 * increments.emit(1);
 * increments.emit(2);
 *
 * console.log(total()); // 3
 *
 * dispose();
 * ```
 *
 * @remarks
 * - `seed` is used as the initial state until the first event is delivered.
 * - `reducer` should be pure and synchronous.
 * - The accumulated value is updated only in response to `source` events.
 * - To stop receiving updates and release subscriptions, call `dispose`.
 *
 * @see hold
 */
export function scan<T, A>(
  source: Event<T>,
  seed: A,
  reducer: (acc: A, value: T) => A,
): [read: Accessor<A>, dispose: Destructor] {
  return createScan(source, seed, reducer);
}

/**
 * Stores the latest value emitted by an event source.
 *
 * `hold` is a specialized form of {@link scan} that replaces the current state
 * with each new event value.
 *
 * @typeParam T - Event payload type.
 *
 * @param source - Event source to subscribe to.
 * @param initial - Initial value returned before the first event arrives.
 *
 * @returns A tuple:
 * - `read` - accessor that returns the latest observed event value.
 * - `dispose` - destructor that unsubscribes from the source and disposes the internal node.
 *
 * @example
 * ```ts
 * const rt = createRuntime();
 * const updates = rt.event<string>();
 *
 * const [latest, dispose] = hold(updates, "idle");
 *
 * console.log(latest()); // "idle"
 *
 * updates.emit("loading");
 * console.log(latest()); // "loading"
 *
 * updates.emit("done");
 * console.log(latest()); // "done"
 *
 * dispose();
 * ```
 *
 * @remarks
 * - `initial` is returned until the first event is delivered.
 * - Equivalent to:
 *   `scan(source, initial, (_, value) => value)`
 *
 * @see scan
 */
export function hold<T>(
  source: Event<T>,
  initial: T,
): [read: Accessor<T>, dispose: Destructor] {
  return createScan(source, initial, (_, value) => value);
}

function createScan<T, A>(
  source: Event<T>,
  seed: A,
  reducer: (acc: A, value: T) => A,
): [read: Accessor<A>, dispose: Destructor] {
  const node = createAccumulator(seed);
  const accessor = () => readProducer(node);

  let unsubscribe: Destructor | undefined = source.subscribe((value: T) => {
    /* c8 ignore start -- disposal unsubscribes before a queued delivery can reach this callback */
    if (isDisposedNode(node)) return;
    /* c8 ignore stop */
    writeProducer(node, reducer(node.payload, value));
  });

  function dispose(): void {
    disposeNodeEvent(node);

    const stop = unsubscribe;
    unsubscribe = undefined;
    stop?.();
  }

  return [accessor, dispose];
}
