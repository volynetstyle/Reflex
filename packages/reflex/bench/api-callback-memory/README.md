# Public API callback benchmark

This benchmark measures escaping callbacks through the public `signal`,
`computed`, and `effect` APIs. It intentionally compares semantic controls,
not `let` versus `var`:

- `capture-index`, `factory`, and `copied-value` preserve an individual index;
- `shared-state` reads one common mutable value;
- `no-item-capture` reuses one callback and therefore has no per-item index.

Run the default 10,000-item matrix with:

```text
pnpm --filter @volynets/reflex bench:api:memory
```

Use `--count=100000`, `--kind=computed`, `--kind=effects`, or
`--variant=capture-index` for focused runs. `--snapshot-dir=<directory>` writes
V8 heap snapshots while the public graph is retained. Every scenario runs in a
child process with `--expose-gc`; results include median phase timings,
post-GC retained heap, public item count, checksum, and cleanup count.

Interpret `computed` and `effects` separately: public accessors and effect
disposers are part of the API cost. A lower-memory `no-item-capture` result is
not a drop-in optimization for indexed callbacks because it intentionally
changes their observable values.
