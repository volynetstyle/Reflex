# reflex-store hot-path benchmarks

Run the current build with `pnpm --filter @volynets/reflex-store bench:hot-paths`. The harness needs a production build in `dist/` and accepts an optional package directory, output JSON path, and case-name filter:

```sh
node --expose-gc bench/hot-paths.node.mjs <package-directory> <output.json> [case-filter]
```

The saved comparison is from Node v25.2.0 on win32 x64. It covers 30 scenarios in three alternating full-suite runs per build. Each workload gets two warmups and seven timed samples; short workloads scale up to 16,777,216 loop iterations. Values are the median of the three process medians. The baseline is the production `dist/` copied immediately before these hot-path edits in the same workspace; the current build includes the optimized source.

The suite median speedup is **1.32×** across the scenarios; 22 of 30 cases improved by more than 5%. The largest changes were:

| Scenario | Before | After | Speedup |
| --- | ---: | ---: | ---: |
| Cell create and dispose | 275 ns | 50 ns | 5.5× |
| `Map.clear()` with 256 entries | 33.5 µs | 18.1 µs | 1.8× |
| `derive` update, 256 fields | 258 µs | 142 µs | 1.8× |
| Projection leaf read | 197 ns | 146 ns | 1.3× |
| Compiled snapshot, 64 flat fields | 16.2 µs | 652 ns | 24.8× |
| Compiled hydration, 64 flat fields | 23.4 µs | 4.5 µs | 5.2× |
| Compiled hydration, 64 nested fields | 93.4 µs | 18.5 µs | 5.1× |
| Compiled setter | 100 ns | 78 ns | 1.3× |

Sub-20 ns cases are sensitive to V8 call-site feedback and host noise. Single-case alternating reruns measured `Set.has()` at 3.27 ns before and 3.21 ns after, and tracked Map reads at 6.01 ns before and 6.01 ns after. The machine-readable file contains all case medians and per-process values.
