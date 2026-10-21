# Ordered native regions: first paired measurement, 2026-10-19

The same js-framework source app and standalone reflex-dom runtime were built
with and without the compiler. Chromium 151.0.7922.34, Windows 10, Intel
Core i5-1235U, headless, normal harness throttling, 7 interleaved iterations.
The raw run is `reflex-dom/bench/js-framework/results/2026-10-19T15-00-17-857Z.json`.
There were no dropped samples or diagnostics errors.

| Scenario                        | Runtime, ms (95% CI) | Compiler, ms (95% CI) | Compiler / runtime |       p |
| ------------------------------- | -------------------: | --------------------: | -----------------: | ------: |
| Create 1,000                    |           51.7 ± 2.2 |            41.8 ± 0.9 |               0.81 | < 0.001 |
| Update every 10th (4× slowdown) |           42.1 ± 1.7 |            42.3 ± 4.7 |               1.00 |   0.940 |
| Create 10,000                   |          521.1 ± 5.7 |          495.1 ± 17.5 |               0.95 |   0.017 |
| Clear 1,000 (4× slowdown)       |          57.4 ± 25.2 |            39.0 ± 3.9 |               0.68 |   0.184 |

Creation improved in this run. Updates were indistinguishable; the noisy clear
samples do not establish a statistically significant improvement. This is a
four-scenario check, not a replacement for the complete benchmark suite.

The compiler emits two maximal native regions: the App shell (11 generated
nodes, 8 opaque/dynamic children) and the entire For row (8 generated elements,
3 bound props and 2 dynamic children). The two Button regions remain runtime
because their use inside an unproven map callback prevents the caller proof.
The earlier implementation compiled 3 small regions, with only one generated
element inside each row. Region counts alone do not measure coverage.

JavaScript size (KiB): runtime 58.5 raw / 20.7 gzip; compiler 60.6 raw / 21.2 gzip.
The compiler keeps the source fallback for SSR, hydration and older renderers.

Reproduce after building the current standalone artifact:

```sh
pnpm --filter @volynets/reflex-dom-compiler bench:ordered
```
