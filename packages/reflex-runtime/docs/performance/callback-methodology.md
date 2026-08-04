# Callback-heavy runtime measurements

The runtime keeps escaping callbacks in `ReactiveNode.compute`. The relevant
workload is therefore a retained reactive graph, not an isolated `let`/`var`
loop. The callback benchmark covers wide fan-out consumers, watcher fan-out,
initial computation, writes, lazy propagation/read, watcher execution, and
watcher disposal/cleanup.

Run the default 10,000-node matrix with:

```text
pnpm --filter @volynets/reflex-runtime bench:runtime:memory
```

Use `--count=100000`, `--kind=watchers`, or `--variant=capture-index` to focus
the run. Add `--snapshot-dir=<directory>` to write one V8 heap snapshot per
scenario while the graph is retained. `heapUsed` is collected after repeated
full GC; the snapshot is the source for retained-size and object-topology
analysis. The script runs each scenario in a child process with
`--expose-gc`, so one graph cannot contaminate the next measurement.

For Inspector allocation sampling, add
`--allocation-sampling --snapshot-dir=<directory>`. This writes a separate
sampling profile beside the heap snapshot. CPU attribution remains a separate
question: use `bench:flame`/the existing `perf:tree` harness after the
semantic and memory checks.

The variants are deliberately semantic controls:

- `capture-index`: a callback closes over the loop's per-item `index`;
- `shared-state`: each callback reads one common mutable state object;
- `factory`: the index is supplied through a callback factory;
- `copied-value`: the index is copied to a local `const`;
- `no-item-capture`: every node reuses one callback and has no per-item
  capture.

The first four indexed forms must produce the same checksum and topology. A
`var` rewrite is not an equivalent control for this workload: it would make
all callbacks observe the final loop index. The semantic contract is covered
by `runtime.callback-semantics.test.ts`.

Interpret results in this order:

1. verify checksum, node count, source-edge count, mutation behavior, and
   watcher cleanup/disposal;
2. compare phase metrics separately (`creation`, `initialComputation`,
   `mutationWrite`, `propagationOrWatcherExecution`, and
   `disposalCleanup`);
3. compare retained `heapUsed` and heap-snapshot retained size;
4. use `src/profiling.ts`, `bench:runtime`, `bench:push-pull`, `perf:tree`, and
   `bench:flame` to attribute CPU/allocation cost to runtime paths.

An optimization is accepted only when it wins on the real callback-heavy
workload and all semantic checks remain unchanged. Context sizes reported by a
particular Node/V8 build are measurements, not a stable ABI or a portable
constant.
