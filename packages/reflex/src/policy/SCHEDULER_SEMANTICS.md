# Effect Scheduler Semantics

This document defines the observable semantics of Reflex effect scheduling and
the test invariants that should hold for each policy:

- `flush`
- `sab`
- `eager`

It is intentionally written from the perspective of externally observable
behavior rather than implementation details. The goal is to make benchmarks,
tests, and adapter integrations agree on what is "correct" for each mode.

## Terms

- `signal`: mutable reactive source
- `computed`: pull-based derived value
- `effect`: push-style observer scheduled for re-execution
- `batch`: transaction boundary that groups writes
- `flush`: explicit delivery of queued effects
- "stable": no more queued effect work remains for the current snapshot
- "scheduled": an effect is queued to run but has not run yet

## Shared Guarantees

These guarantees hold in every mode:

1. `signal` writes performed inside `batch()` become the committed source of
truth when the batch exits.
2. `computed` reads after the batch must observe the latest committed signal
state, even if effects have not been delivered yet.
3. `effect` re-execution is deduplicated per scheduled node.
4. Effects must not flush in the middle of propagation.
5. Nested batches behave like one outer transaction for delivery purposes.
6. Disposed effects must not run again.
7. FIFO delivery order is preserved for the scheduler queue.

The main semantic difference between modes is not whether values are correct,
but when queued effects become observable.

## Mode: `flush`

### Intent

`flush` is the low-overhead mode. It separates mutation/propagation from
effect delivery.

### Observable Contract

After `batch(fn)` in `flush` mode:

- signal state is up to date
- computed reads are up to date
- effects may still be pending
- the system is not guaranteed to be stable

This means the following is correct:

```ts
rt.batch(() => {
  setSource(3);
});

expect(source()).toBe(3);
expect(derived()).toBe(6);
expect(effectSpy).toHaveBeenCalledTimes(1);

rt.flush();

expect(effectSpy).toHaveBeenCalledTimes(2);
```

### Correct Test Invariants

Tests in `flush` mode may assert immediately after `batch()`:

- signal values changed
- computed values changed
- effects are still at their previous call count

Tests in `flush` mode may assert after `flush()`:

- queued effects have run
- cleanup has executed if applicable
- the system is stable for the current snapshot

### Incorrect Expectation

This is not a valid invariant for strict `flush`:

```ts
rt.batch(() => {
  setSource(3);
});

expect(effectSpy).toHaveBeenCalledTimes(2);
```

That expectation asks for stable-after-batch semantics, which `flush` does not
promise.

## Mode: `sab`

### Intent

`sab` means "stable after batch".

It keeps lazy enqueue semantics during propagation, but auto-delivers pending
effects when the outermost batch exits and the runtime is in a safe idle state.

### Observable Contract

Inside a batch:

- effects stay queued
- no mid-propagation flush occurs

After the outermost batch exits:

- signal state is current
- computed reads are current
- queued effects are auto-delivered
- the system is stable for the current snapshot

This means the following is correct:

```ts
rt.batch(() => {
  setSource(3);
});

expect(source()).toBe(3);
expect(derived()).toBe(6);
expect(effectSpy).toHaveBeenCalledTimes(2);
```

### Correct Test Invariants

Tests in `sab` mode should assert:

- no effect rerun occurs inside the batch body
- effect reruns are visible immediately after the outermost batch exits
- reads inside the batch can still observe current pull-based values

### Important Nuance

If the outermost batch exits while propagation is still active or a computed is
currently evaluating, `sab` does not flush yet. The queue stays pending until a
later explicit `flush()`. The contract is "stable after batch when safe", not
"flush under every circumstance".

## Mode: `eager`

### Intent

`eager` auto-delivers effects whenever it is safe to do so.

### Observable Contract

When the runtime is idle and not inside propagation:

- enqueue can trigger immediate delivery
- exiting the outermost batch stabilizes the system automatically
- explicit `flush()` is normally unnecessary

This means the following is correct:

```ts
rt.batch(() => {
  setSource(3);
});

expect(source()).toBe(3);
expect(derived()).toBe(6);
expect(effectSpy).toHaveBeenCalledTimes(2);
```

### Correct Test Invariants

Tests in `eager` mode may assert immediately after:

- a plain write performed while idle
- an outermost `batch()` exit
- event delivery completion

that:

- signal values are current
- computed values are current
- effects have already observed the latest stable snapshot

### Important Distinction From `sab`

`eager` is more aggressive than `sab`:

- `eager` may flush on idle enqueue outside batches
- `sab` does not change enqueue into an auto-flushing operation
- `sab` only changes what happens at outermost batch exit

### Important Nuance

`eager` still must not flush during active propagation or while an enclosing
computed is running. Delivery happens at the earliest safe point, not literally
"immediately no matter what".

## Test Matrix

The same scenario should be asserted differently depending on mode.

### Scenario A: Write inside batch, then read signal and computed

```ts
rt.batch(() => {
  setSource(3);
});
```

Valid in all modes:

```ts
expect(source()).toBe(3);
expect(derived()).toBe(6);
```

### Scenario B: Write inside batch, then inspect effect call count

Initial effect call count: `1`

Valid expectations:

- `flush`: still `1` until explicit `flush()`
- `sab`: already `2` after batch exit
- `eager`: already `2` after batch exit

### Scenario C: Multiple writes in one batch

```ts
rt.batch(() => {
  setLeft(2);
  setRight(20);
});
```

Valid in all modes:

- effects must observe one consistent final snapshot
- intermediate partial snapshots must not leak through effect delivery

Expected timing:

- `flush`: after explicit `rt.flush()`
- `sab`: after batch exit
- `eager`: after batch exit

### Scenario D: Nested batch

```ts
rt.batch(() => {
  setA(1);
  rt.batch(() => {
    setB(2);
  });
});
```

Valid expectations:

- no post-batch delivery after the inner batch alone
- delivery happens only when the outermost batch exits
- in `flush`, even outermost batch exit still does not deliver without
  explicit `flush()`

### Scenario E: Write outside batch while idle

```ts
setSource(3);
```

Expected timing:

- `flush`: effect remains queued until `flush()`
- `sab`: effect remains queued until `flush()`
- `eager`: effect may run automatically

This is the most important behavioral difference between `eager` and `sab`.

## Benchmark Interpretation

These modes are expected to have different costs:

- `flush` without `flush()` is cheaper because it postpones effect work
- `batch(); flush();` is more expensive because it actually delivers effects
- `sab` is close in cost to `batch(); flush();`
- `eager` can be cheaper or more expensive depending on workload shape, but it
  still pays for auto-delivery

Therefore, this comparison is not apples-to-apples:

- `flush` without delivery
- `flush` with delivery

If a benchmark expects the effect to have already re-run, then it is measuring
delivery cost, not only propagation cost.

## Adapter Guidance

Adapters should decide explicitly which contract they expose.

### Strict `flush` Adapter

Use this when you want cheap writes and explicit stabilization:

```ts
withBatch(fn) {
  return rt.batch(fn);
}

settleEffects() {
  rt.flush();
}
```

### Stable-After-Batch Adapter

Use this when tests or integrations require post-batch stability:

```ts
withBatch(fn) {
  return rt.batch(fn);
}

// runtime created with effectStrategy: "sab"
```

or:

```ts
withBatch(fn) {
  const result = rt.batch(fn);
  rt.flush();
  return result;
}
```

### Eager Adapter

Use this when the integration wants auto-delivery semantics generally:

```ts
createRuntime({ effectStrategy: "eager" });
```

## Recommended Test Strategy

Do not force one invariant onto all scheduler modes.

Instead, split tests into:

1. Pull correctness tests
   - signal state after writes
   - computed consistency after writes

2. Delivery timing tests
   - whether effects are still queued
   - when effects become observable

3. Stabilization tests
   - whether the system is guaranteed settled after a boundary

In practice:

- if a test asserts `effectSpy === 2` immediately after `batch()`, it is a
  test for `sab` or `eager`, not strict `flush`
- if a test asserts `signal` and `computed` only, it is valid across all modes
- if a benchmark wants the cheapest `flush` path, it must not demand settled
  effects as part of correctness

## Summary

- `flush` is correct when effects remain pending after `batch()`
- `sab` is correct when effects stay lazy during the batch but are delivered at
  outermost batch exit
- `eager` is correct when effects are auto-delivered at the earliest safe point

The key rule is:

Correctness is mode-relative.

The runtime should not be judged by an invariant it never promised to uphold.
