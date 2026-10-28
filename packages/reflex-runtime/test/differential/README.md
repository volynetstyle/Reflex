# Differential testkit

The differential testkit compares observable behavior. Its `SpecMachine` and
`ReflexMachine` implementations are private so test languages cannot couple the
oracle to production flags, graph shape, queues, or walker internals.

## Public layers

- `api/dsl.ts` defines expressions, operations, programs, and cases.
- `compare(program)` returns the Spec and Reflex traces plus the first mismatch.
- `assertEquivalent(program)` fails at the first mismatching operation.
- `explore(cases)` reports equivalent and divergent programs while preserving
  case provenance such as `family` and `faultModel`.
- `compareTransformation(...)` compares both base programs against Spec and
  compares explicitly aligned Spec/Reflex operation boundaries. Alignment may
  skip inserted setup operations; it never sorts events or removes errors. It
  must be non-empty and strictly increasing on both sides, and the result
  counts `informativePairs`, the aligned boundaries that observed anything.

Run the independent TypeScript gate with:

```text
pnpm typecheck:differential
```

The package `typecheck` command includes this gate.

## Files here that are not spec comparisons

`runtime.batch-boundary`, `runtime.reentrant-write`, `runtime.epoch-collision`
and `runtime.tracking-stamp` test the kernel directly: host batching and
reentrant writes against small reference traces, tracking stamps against graph
integrity. The SpecMachine DSL cannot express their conditions. They stay here
for this directory's typecheck gate; the testkit catalogs them as
`unit.host-protocol` and `unit.tracking-representation`, not as `spec`.

## Languages and fault lifecycle

Bounded, recovery, adversarial, stateful, and watcher-evidence languages each
state their own bounds. An exhaustive result applies only to that language.

Known active mismatches belong in `catalog/active.ts`. After a fix, a minimized
witness moves to `catalog/historical.ts` with its fixing commit. Development
mutants qualify known fault models; holdout mutants remain separate evidence
and are not retuned around a discovered witness.

`docs/SEMANTIC_CONTRACT.md` defines the observable contract. Language-specific
baseline files record the bounds and results of individual investigations.
