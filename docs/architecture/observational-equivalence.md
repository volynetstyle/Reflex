# Observational equivalence for execution domains

Normative companion to [execution-domains.md](./execution-domains.md).

## Claim

A local execution in domain `A`, under the same local inputs and scheduling
policy, is observationally equivalent to running the prior kernel with only
`A`, after erasing every independent domain and every boundary operation.

## Trace events

A trace is a sequence of events tagged with the domain they occur in:

| Event                     | Payload                          |
| ------------------------- | -------------------------------- |
| `read(node) = v`          | value returned by a read         |
| `compute(node)`           | a computed callback starts       |
| `watch(node)`             | a watcher callback starts        |
| `cleanup(node)`           | a watcher cleanup runs           |
| `invalidate(node)`        | `onNodeInvalidated` delivery     |
| `idle`                    | `onRuntimeIdle` delivery         |
| `enqueue(node)`/`flush`   | scheduler emissions              |
| `dispose(node)`           | teardown of a node               |
| `throw(e)`                | exception surfacing at an entry  |

## Projection

`π_A(trace)` keeps only events tagged `A`, in order. Boundary operations
(`enter`, `exit`, `publish`, `deliver`) are erased; a port delivery into `A`
is replaced by the `write` it performs on `A`'s mirror producer.

Equivalence holds when, for every interleaving `τ` of domains that the
managed API permits, `π_A(τ)` equals the trace of running `A` alone with the
same `A` inputs (including delivered port writes at the same positions).

## Ordering rules

- Order within a domain is preserved exactly; there is no order between
  independent domains except through ports.
- An exception surfaces at the entry that started it; it never surfaces in
  another domain, and every bank, hook stack and phase stack is restored.
- Host scheduling policy (eager / `sab` / microtask) is a per-domain input.
  Equivalence compares runs with the same policy.
- `idle` and `invalidate` deliveries for `A` use only `A`'s hooks.

## Structural vs measured claims

| Claim                          | Kind                         | Gate                                    |
| ------------------------------ | ---------------------------- | --------------------------------------- |
| Node/edge shape unchanged      | Structural, strict           | `check:architecture`                    |
| No domain code on hot path     | Structural, strict           | `check:architecture`                    |
| Kernel operation counts        | Structural, strict           | `test:projection`, cost attribution     |
| Wall-clock performance         | Measured, non-regression     | `bench:runtime`, `bench:quality-gate`   |

Unchanged source does not by itself prove equal timing; timing claims require
matched benchmark runs.

## Test oracle

`packages/reflex-runtime/test/runtime/contracts/runtime.domain-equivalence.test.ts`
generates two disjoint graphs and random valid interleavings, records the
projected trace of `A`, and compares it with `A` running alone.
