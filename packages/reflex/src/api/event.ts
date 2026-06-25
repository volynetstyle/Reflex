import { readProducer, writeProducer } from "@volynets/reflex-runtime/internal";
import type { Event } from "../infra/runtime";
import { createAccumulator } from "../infra/factory";
import { disposeNodeEvent } from "@volynets/reflex-runtime/internal";
import {
  emitEvent,
  EventSource,
  subscribeEvent,
} from "../infra/event";

type EventValue<E extends Event<unknown>> =
  E extends Event<infer T> ? T : never;

function createEvent<T>(
  subscribe: (fn: (value: T) => void) => Destructor,
): Event<T> {
  return { subscribe };
}

function createDerivedEvent<T>(
  connect: (emit: (value: T) => void) => Destructor,
): Event<T> {
  const source = new EventSource<T>();
  let subscriberCount = 0;
  let disconnect: Destructor | undefined;

  return createEvent((fn) => {
    const unsubscribe = subscribeEvent(source, fn);
    if (subscriberCount++ === 0) {
      disconnect = connect((value) => emitEvent(source, value));
    }
    let active = true;

    return () => {
      if (!active) return;
      active = false;

      unsubscribe();

      if (--subscriberCount !== 0) return;

      const stop = disconnect;
      disconnect = undefined;
      stop?.();
    };
  });
}

/**
 * Subscribes to the first value from `source`, then unsubscribes automatically.
 *
 * The subscription is disposed before `fn` runs, so nested emits triggered from
 * inside `fn` will not deliver a second time to the same callback.
 */
export function subscribeOnce<T>(
  source: Event<T>,
  fn: (value: T) => void,
): Destructor {
  let active = true;
  let unsubscribe: Destructor | undefined;
  let unsubscribePending = false;

  const dispose = () => {
    if (!active) return;

    active = false;

    const stop = unsubscribe;
    if (stop === undefined) {
      unsubscribePending = true;
      return;
    }

    unsubscribe = undefined;
    stop();
  };

  unsubscribe = source.subscribe((value) => {
    if (!active) return;

    dispose();
    fn(value);
  });

  if (unsubscribePending) {
    const stop = unsubscribe;
    unsubscribe = undefined;
    stop?.();
  }

  return dispose;
}

/**
 * Projects each event value from `source` into a new event stream.
 */
export function map<T, U>(
  source: Event<T>,
  project: (value: T) => U,
): Event<U> {
  return createDerivedEvent((emit) =>
    source.subscribe((value) => {
      emit(project(value));
    }),
  );
}

/**
 * Forwards only the values from `source` that satisfy `predicate`.
 */
export function filter<T, S extends T>(
  source: Event<T>,
  predicate: (value: T) => value is S,
): Event<S>;
export function filter<T>(
  source: Event<T>,
  predicate: (value: T) => boolean,
): Event<T>;
export function filter<T>(
  source: Event<T>,
  predicate: (value: T) => boolean,
): Event<T> {
  return createDerivedEvent((emit) =>
    source.subscribe((value) => {
      if (predicate(value)) {
        emit(value);
      }
    }),
  );
}

/**
 * Merges multiple event sources into one event stream.
 *
 * The resulting event preserves the delivery order defined by the upstream
 * sources and their runtime dispatcher.
 */
export function merge<const Sources extends readonly Event<unknown>[]>(
  ...sources: Sources
): Event<EventValue<Sources[number]>> {
  return createDerivedEvent((emit) => {
    const unsubscribers = sources.map((source) =>
      source.subscribe((value) => {
        emit(value as EventValue<Sources[number]>);
      }),
    );

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  });
}

/**
 * Projects each source value to an event stream and forwards values from the
 * latest projected stream.
 *
 * Previous inner subscriptions are disposed as soon as a newer source event
 * arrives. This is useful for event-sequence logic where a phase owns a
 * temporary event dependency, such as listening to pointer moves only after a
 * pointer-down event.
 */
export function switchMap<T, U>(
  source: Event<T>,
  project: (value: T) => Event<U>,
): Event<U> {
  return createDerivedEvent((emit) => {
    let unsubscribeInner: Destructor | undefined;

    const unsubscribeOuter = source.subscribe((value) => {
      unsubscribeInner?.();
      unsubscribeInner = project(value).subscribe(emit);
    });

    return () => {
      unsubscribeInner?.();
      unsubscribeInner = undefined;
      unsubscribeOuter();
    };
  });
}

/**
 * Flattens an event stream of event streams by forwarding values from the
 * latest inner stream.
 *
 * Equivalent to `switchMap(source, (inner) => inner)`.
 */
export function flatten<T>(source: Event<Event<T>>): Event<T> {
  return switchMap(source, (inner) => inner);
}

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
 * - `reducer` should derive the next state only from the previous accumulated
 *   state and the current event value.
 * - The accumulated value is updated only in response to `source` events.
 * - Do not read signals, computeds, or other reactive values inside
 *   `reducer`. `scan` does not track reactive dependencies read there.
 * - If you need to combine event-driven state with reactive state, first
 *   derive the accumulator with `scan`, then combine it outside via
 *   `computed()`.
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
  let current = seed;
  let active = true;
  const accessor = () => (active ? readProducer(node) : current);

  let unsubscribe: Destructor | undefined = source.subscribe((value: T) => {
    /* c8 ignore start -- disposal unsubscribes before a queued delivery can reach this callback */
    if (!active) return;
    /* c8 ignore stop */
    current = reducer(current, value);
    writeProducer(node, current);
  });

  function dispose(): void {
    if (!active) return;
    active = false;
    disposeNodeEvent(node);

    const stop = unsubscribe;
    unsubscribe = undefined;
    stop?.();
  }

  return [accessor, dispose];
}
