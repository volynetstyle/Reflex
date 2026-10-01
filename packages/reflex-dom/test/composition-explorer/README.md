# Reflex Composition Explorer

Run from the repository root:

```sh
pnpm --filter @volynets/reflex-dom exec vitest run --config vite.config.ts test/composition-explorer.test.ts
pnpm --filter @volynets/reflex-dom exec vitest run --config vite.config.ts test/composition-explorer.api.test.tsx
pnpm --filter @volynets/reflex-dom exec vitest run --config vite.browser.config.ts test/composition-explorer.browser.test.ts
pnpm --filter @volynets/reflex-dom exec tsc --noEmit -p tsconfig.composition-explorer.json
```

Set `REFLEX_COMPOSITION_REPORT=1` and pass `--reporter=verbose` to Vitest to
print coverage counts, classifications and the empirical interaction matrix.

The explorer exercises the public exports in `src/index.ts`. Its runtime and
type inventories cover every named export. The explorer itself lives in the
test tree and adds no production bundle code.

## Executable model

`model.ts` defines a valid-program language with signal, computed, memo, model,
context and ref sources; JSX, `Show`, `Switch`, keyed `For`, `Portal` and effect
consumers; component, nested owner, component-owned model and independent model
topologies; DOM and supported SSR hosts. `coverPrograms()` greedily covers valid
feature pairs and selected risky triples. Every DOM program runs canonical
traces for branch entry, exit and re-entry, same-value and positive-to-positive
writes, hidden disposal and a post-disposal write. `For` also runs a multi-item
insert, move, delete and reappearance trace. `generateTrace(seed)` adds a
reproducible fuzz trace.

`execute.tsx` runs each program in a fresh app and container. The selected
owner actually mounts the consumer. It checks the consumer's owner ancestry,
records owner and child cleanup, and verifies keyed row identity and cleanup
through list changes. An independent model survives component disposal and is
finally disposed by the executor. An unrelated signal drives its own effect.
Snapshots record visible DOM after initial render and at settlement/disposal
boundaries; managed comment markers are removed. The SSR comparison uses only
the pure initial render, since a server render cannot replay client writes or
disposal.
`validateCase()` rejects an SSR program with a nonempty trace or a DOM-only
consumer instead of silently ignoring unsupported operations.

`composition-explorer.api.test.tsx` exercises every runtime export in
compositions with concrete DOM, lifecycle or model assertions. Its manifest
maps exports to registry functions that Vitest executes, and fails when a new
runtime export lacks a scenario. `api.types.typecheck.tsx`
imports every type-only export and checks representative type relationships.

The relations currently checked are identity computed insertion, single-case
`Show` to `Switch`, nested owner insertion, repeated same-value writes, and
unrelated state insertion. Predicate-based relations check output, target
lifetime, errors, balanced ownership and any promised extra cleanup. Identity
insertion is inapplicable when a component-owned derivation would be read by an
independent model after the component is disposed. Reads, computations,
invalidations and observed DOM mutations are diagnostic costs, never a
correctness oracle.

`explore()` returns baselines, comparisons, classifications and interaction
counts for other tests or research scripts. On a divergence, the failing test
prints the seed, program, transformation, observations and a reduced case.
`shrinkCase()` first removes trace operations, then simplifies the source,
consumer and optional structure while the failure still reproduces. The
explorer checks transformation applicability and case validity at every shrink
candidate. `interactionMatrix()` indexes applicable comparison samples and
divergences by feature pairs and triples, including transformation, scheduler
strategy and trace family. `classifyEvidence()` reports failed declared
relations as `DIVERGENT` or `CONDITIONAL_DIVERGENCE` when only some workloads
fail. Cost specialization requires a measured win or tradeoff for the variant.

The cost vector currently counts API reads, derivation evaluations, runtime
invalidations and DOM mutation records. It does not measure allocations,
memory or elapsed time, so cost based categories describe only these measured
coordinates. New capabilities should be added to the program language with
their validity constraints and a transformation contract before they enter
coverage generation.
