import assert from "node:assert/strict";

function noop() {}

/**
 * Minimal host adapter that lets the contract runner exercise a reactive
 * library without depending on its internal node model.
 *
 * @typedef {object} RuntimeContractAdapter
 * @property {() => void} reset
 * @property {(value: unknown) => unknown} createSignal
 * @property {(signal: unknown) => unknown} readSignal
 * @property {(signal: unknown, value: unknown) => void} writeSignal
 * @property {(compute: () => unknown) => unknown} createComputed
 * @property {(computed: unknown) => unknown} readComputed
 * @property {(effect: () => void | (() => void)) => unknown} createEffect
 * @property {(effect: unknown) => void} disposeEffect
 * @property {() => void} flushEffects
 * @property {() => number} pendingEffects
 */

function readSignal(adapter, signal) {
  return adapter.readSignal(signal);
}

function readComputed(adapter, computed) {
  return adapter.readComputed(computed);
}

function writeSignal(adapter, signal, value) {
  adapter.writeSignal(signal, value);
}

function createQueueScheduler() {
  const pending = [];

  return {
    enqueue(node) {
      if (!pending.includes(node)) {
        pending.push(node);
      }
    },
    flush(run) {
      while (pending.length > 0) {
        run(pending.shift());
      }
    },
    get size() {
      return pending.length;
    },
  };
}

/**
 * Wrap the current Reflex runtime exports into the generic contract adapter.
 * This keeps the contract tests portable while still letting Reflex reuse its
 * low-level `ReactiveNode` constructors and invalidation hooks.
 *
 * @param {Record<string, unknown>} runtime
 * @returns {RuntimeContractAdapter}
 */
function createReflexFixtures(runtime) {
  const {
    CONSUMER_INITIAL_STATE,
    PRODUCER_INITIAL_STATE,
    ReactiveNode,
    WATCHER_INITIAL_STATE,
    disposeWatcher,
    readConsumer,
    readProducer,
    resetState,
    runWatcher,
    setHooks,
    setOptions,
    setRuntimeHooks,
    writeProducer,
  } = runtime;

  const scheduler = createQueueScheduler();

  return {
    reset() {
      resetState();
      setRuntimeHooks?.();
      setOptions?.({});
      scheduler.flush(noop);
      setHooks({
        onSinkInvalidated(node) {
          scheduler.enqueue(node);
        },
      });
    },
    createSignal(value) {
      return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
    },
    readSignal(signal) {
      return readProducer(signal);
    },
    writeSignal(signal, value) {
      writeProducer(signal, value);
    },
    createComputed(compute) {
      return new ReactiveNode(undefined, compute, CONSUMER_INITIAL_STATE);
    },
    readComputed(computed) {
      return readConsumer(computed);
    },
    createEffect(effect) {
      const watcher = new ReactiveNode(null, effect, WATCHER_INITIAL_STATE);
      runWatcher(watcher);
      return watcher;
    },
    disposeEffect(effect) {
      disposeWatcher(effect);
    },
    flushEffects() {
      scheduler.flush(runWatcher);
    },
    pendingEffects() {
      return scheduler.size;
    },
  };
}

/**
 * @param {RuntimeContractAdapter} adapter
 */
function assertAdapter(adapter) {
  const missing = [
    "reset",
    "createSignal",
    "readSignal",
    "writeSignal",
    "createComputed",
    "readComputed",
    "createEffect",
    "disposeEffect",
    "flushEffects",
    "pendingEffects",
  ].filter((name) => typeof adapter[name] !== "function");

  if (missing.length > 0) {
    throw new TypeError(
      `Runtime contract adapter is missing: ${missing.join(", ")}`,
    );
  }
}

/**
 * Create a reusable adapter for the packed Reflex runtime entrypoint.
 *
 * @param {Record<string, unknown>} runtime
 * @returns {RuntimeContractAdapter}
 */
export function createReflexRuntimeContractAdapter(runtime) {
  const adapter = createReflexFixtures(runtime);
  assertAdapter(adapter);
  return adapter;
}

/**
 * Run portable semantic invariants against a host adapter.
 *
 * The checks intentionally stay at the observable-behavior layer: lazy
 * computed caching, latest-write visibility, dynamic dependency cleanup,
 * diamond recompute cardinality, and watcher scheduling/disposal semantics.
 *
 * @param {RuntimeContractAdapter} adapter
 * @param {{ label?: string }} [options]
 * @returns {string[]}
 */
export function runRuntimeContractTests(adapter, options = {}) {
  assertAdapter(adapter);

  const label = options.label ?? "runtime";
  const results = [];

  function test(name, fn) {
    adapter.reset();
    fn();
    results.push(`${label}: ${name}`);
  }

  test("computed values are lazy and cached until a dependency changes", () => {
    let calls = 0;
    const source = adapter.createSignal(1);
    const doubled = adapter.createComputed(() => {
      calls += 1;
      return readSignal(adapter, source) * 2;
    });

    assert.equal(calls, 0);
    assert.equal(readComputed(adapter, doubled), 2);
    assert.equal(readComputed(adapter, doubled), 2);
    assert.equal(calls, 1);

    writeSignal(adapter, source, 2);

    assert.equal(calls, 1);
    assert.equal(readComputed(adapter, doubled), 4);
    assert.equal(calls, 2);
  });

  test("rapid successive writes expose the latest value", () => {
    const source = adapter.createSignal(0);
    const current = adapter.createComputed(() => readSignal(adapter, source));

    assert.equal(readComputed(adapter, current), 0);

    for (let value = 1; value <= 10; value += 1) {
      writeSignal(adapter, source, value);
    }

    assert.equal(readComputed(adapter, current), 10);
  });

  test("dynamic dependencies unsubscribe from stale branches", () => {
    const gate = adapter.createSignal(true);
    const left = adapter.createSignal(1);
    const right = adapter.createSignal(10);
    const selected = adapter.createComputed(() =>
      readSignal(adapter, gate)
        ? readSignal(adapter, left)
        : readSignal(adapter, right),
    );

    assert.equal(readComputed(adapter, selected), 1);

    writeSignal(adapter, gate, false);
    assert.equal(readComputed(adapter, selected), 10);

    writeSignal(adapter, left, 2);
    assert.equal(readComputed(adapter, selected), 10);

    writeSignal(adapter, right, 20);
    assert.equal(readComputed(adapter, selected), 20);
  });

  test("diamond graphs recompute each derived node at most once per read", () => {
    const calls = {
      left: 0,
      right: 0,
      shared: 0,
      sink: 0,
    };
    const source = adapter.createSignal(1);
    const shared = adapter.createComputed(() => {
      calls.shared += 1;
      return readSignal(adapter, source) * 2;
    });
    const left = adapter.createComputed(() => {
      calls.left += 1;
      return readComputed(adapter, shared) + 1;
    });
    const right = adapter.createComputed(() => {
      calls.right += 1;
      return readComputed(adapter, shared) + 2;
    });
    const sink = adapter.createComputed(() => {
      calls.sink += 1;
      return readComputed(adapter, left) + readComputed(adapter, right);
    });

    assert.equal(readComputed(adapter, sink), 7);
    assert.deepEqual(calls, { left: 1, right: 1, shared: 1, sink: 1 });

    writeSignal(adapter, source, 2);

    assert.equal(readComputed(adapter, sink), 11);
    assert.deepEqual(calls, { left: 2, right: 2, shared: 2, sink: 2 });
  });

  test("effects are scheduled once for a burst and observe flushed state", () => {
    const source = adapter.createSignal(1);
    const values = [];
    const cleanups = [];
    const effect = adapter.createEffect(() => {
      const value = readSignal(adapter, source);
      values.push(value);

      return () => {
        cleanups.push(value);
      };
    });

    assert.deepEqual(values, [1]);
    assert.equal(adapter.pendingEffects(), 0);

    writeSignal(adapter, source, 2);
    writeSignal(adapter, source, 3);

    assert.equal(adapter.pendingEffects(), 1);

    adapter.flushEffects();

    assert.deepEqual(values, [1, 3]);
    assert.deepEqual(cleanups, [1]);

    adapter.disposeEffect(effect);
  });

  test("disposed effects stop observing future writes", () => {
    const source = adapter.createSignal(1);
    const values = [];
    const cleanups = [];
    const effect = adapter.createEffect(() => {
      const value = readSignal(adapter, source);
      values.push(value);

      return () => {
        cleanups.push(value);
      };
    });

    adapter.disposeEffect(effect);
    writeSignal(adapter, source, 2);
    adapter.flushEffects();

    assert.deepEqual(values, [1]);
    assert.deepEqual(cleanups, [1]);
    assert.equal(adapter.pendingEffects(), 0);
  });

  return results;
}
