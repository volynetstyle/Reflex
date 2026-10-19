# DOM compiler benchmark

2026-10-19T11:47:16.762Z. Commit `73460648b8`, corpus `ce272b63da26`.

Each instance is one row of reflex-dom's `For` whose callback returns the scenario tree. Median µs per mounted instance; ratio is variant / baseline (lower is faster).

## chromium

Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.7922.34 Safari/537.36  
Timer resolution: 100.0 µs

| scenario | nodes | metric | count | baseline | native | template | native/base | template/base |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| tiny | 2 | cold | 1 | 4.67 | 4.33 | 7.67 | 0.93 | 1.64 |
| tiny | 2 | mount | 100 | 0.88 | 0.80 | 0.70 | 0.91 | 0.80 |
| tiny | 2 | mount+dispose | 100 | 1.10 | 1.00 | 0.90 | 0.91 | 0.82 |
| tiny | 2 | mount | 1000 | 0.83 | 0.72 | 0.65 | 0.88 | 0.79 |
| tiny | 2 | mount+dispose | 1000 | 0.97 | 0.92 | 0.83 | 0.95 | 0.85 |
| tiny | 2 | mount | 10000 | 0.83 | 0.75 | 0.68 | 0.90 | 0.82 |
| tiny | 2 | mount+dispose | 10000 | 1.02 | 0.96 | 0.86 | 0.94 | 0.84 |
| profile | 5 | cold | 1 | 5.33 | 5.00 | 8.67 | 0.94 | 1.62 |
| profile | 5 | mount | 100 | 1.85 | 1.63 | 1.20 | 0.88 | 0.65 |
| profile | 5 | mount+dispose | 100 | 2.10 | 1.90 | 1.50 | 0.90 | 0.71 |
| profile | 5 | mount | 1000 | 1.82 | 1.60 | 1.18 | 0.88 | 0.64 |
| profile | 5 | mount+dispose | 1000 | 2.08 | 1.82 | 1.42 | 0.88 | 0.69 |
| profile | 5 | mount | 10000 | 1.93 | 1.72 | 1.36 | 0.89 | 0.70 |
| profile | 5 | mount+dispose | 10000 | 2.06 | 2.05 | 1.47 | 1.00 | 0.71 |
| card | 18 | cold | 1 | 12.7 | 10.3 | 16.7 | 0.82 | 1.32 |
| card | 18 | mount | 100 | 8.17 | 6.98 | 4.38 | 0.85 | 0.54 |
| card | 18 | mount+dispose | 100 | 8.95 | 7.28 | 4.80 | 0.81 | 0.54 |
| card | 18 | mount | 1000 | 8.48 | 6.90 | 4.35 | 0.81 | 0.51 |
| card | 18 | mount+dispose | 1000 | 9.17 | 7.80 | 5.03 | 0.85 | 0.55 |
| card | 18 | mount | 10000 | 9.61 | 8.12 | 4.72 | 0.84 | 0.49 |
| card | 18 | mount+dispose | 10000 | 10.3 | 7.90 | 5.29 | 0.76 | 0.51 |
| article | 40 | cold | 1 | 20.0 | 16.3 | 24.3 | 0.82 | 1.22 |
| article | 40 | mount | 100 | 15.8 | 13.2 | 7.88 | 0.84 | 0.50 |
| article | 40 | mount+dispose | 100 | 17.4 | 13.5 | 9.48 | 0.78 | 0.55 |
| article | 40 | mount | 1000 | 16.6 | 12.8 | 8.35 | 0.77 | 0.50 |
| article | 40 | mount+dispose | 1000 | 18.4 | 13.9 | 9.33 | 0.75 | 0.51 |
| article | 40 | mount | 10000 | 17.9 | 14.4 | 9.33 | 0.81 | 0.52 |
| article | 40 | mount+dispose | 10000 | 19.8 | 14.9 | 10.1 | 0.75 | 0.51 |

Break-even (template vs native, from cold and 1000-instance mount):

- tiny (2 nodes): template pays off after ~46 mounts
- profile (5 nodes): template pays off after ~10 mounts
- card (18 nodes): template pays off after ~4 mounts
- article (40 nodes): template pays off after ~3 mounts

JS heap retained while mounted, per instance (Chromium, fresh page, median of 5 rounds of 10000 instances). Post-dispose residuals are not reported: `bench/memory-probe.ts` reproduces the same per-cycle growth with plain DOM code and no Reflex.

| scenario | variant | bytes/instance |
|---|---|---:|
| tiny | baseline | 154 |
| tiny | native | 125 |
| tiny | template | 125 |
| profile | baseline | 200 |
| profile | native | 158 |
| profile | template | 125 |
| card | baseline | 301 |
| card | native | 284 |
| card | template | 125 |
| article | baseline | 415 |
| article | native | 441 |
| article | template | 102 |

## firefox

Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0  
Timer resolution: 1000 µs

| scenario | nodes | metric | count | baseline | native | template | native/base | template/base |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| tiny | 2 | cold | 1 | 23.3 | 26.7 | 26.7 | 1.14 | 1.14 |
| tiny | 2 | mount | 100 | 2.00 | 1.75 | 1.50 | 0.88 | 0.75 |
| tiny | 2 | mount+dispose | 100 | 2.25 | 2.25 | 1.75 | 1.00 | 0.78 |
| tiny | 2 | mount | 1000 | 2.00 | 1.75 | 1.50 | 0.88 | 0.75 |
| tiny | 2 | mount+dispose | 1000 | 2.25 | 2.00 | 1.50 | 0.89 | 0.67 |
| tiny | 2 | mount | 10000 | 1.90 | 1.70 | 1.40 | 0.89 | 0.74 |
| tiny | 2 | mount+dispose | 10000 | 2.20 | 2.00 | 1.60 | 0.91 | 0.73 |
| profile | 5 | cold | 1 | 30.0 | 33.3 | 26.7 | 1.11 | 0.89 |
| profile | 5 | mount | 100 | 4.00 | 4.00 | 2.50 | 1.00 | 0.63 |
| profile | 5 | mount+dispose | 100 | 4.25 | 4.25 | 2.75 | 1.00 | 0.65 |
| profile | 5 | mount | 1000 | 3.75 | 3.75 | 2.50 | 1.00 | 0.67 |
| profile | 5 | mount+dispose | 1000 | 4.25 | 4.25 | 2.75 | 1.00 | 0.65 |
| profile | 5 | mount | 10000 | 4.20 | 4.30 | 2.60 | 1.02 | 0.62 |
| profile | 5 | mount+dispose | 10000 | 4.50 | 4.50 | 2.90 | 1.00 | 0.64 |
| card | 18 | cold | 1 | 63.3 | 76.7 | 40.0 | 1.21 | 0.63 |
| card | 18 | mount | 100 | 16.8 | 16.5 | 8.25 | 0.99 | 0.49 |
| card | 18 | mount+dispose | 100 | 17.8 | 17.3 | 8.75 | 0.97 | 0.49 |
| card | 18 | mount | 1000 | 17.8 | 18.0 | 8.25 | 1.01 | 0.46 |
| card | 18 | mount+dispose | 1000 | 19.3 | 18.3 | 8.75 | 0.95 | 0.45 |
| card | 18 | mount | 10000 | 18.3 | 17.9 | 9.00 | 0.98 | 0.49 |
| card | 18 | mount+dispose | 10000 | 42.0 | 43.6 | 29.8 | 1.04 | 0.71 |
| article | 40 | cold | 1 | 247 | 270 | 277 | 1.09 | 1.12 |
| article | 40 | mount | 100 | 37.8 | 33.3 | 15.3 | 0.88 | 0.40 |
| article | 40 | mount+dispose | 100 | 35.8 | 37.3 | 17.3 | 1.04 | 0.48 |
| article | 40 | mount | 1000 | 33.5 | 35.5 | 16.8 | 1.06 | 0.50 |
| article | 40 | mount+dispose | 1000 | 33.8 | 37.8 | 17.0 | 1.12 | 0.50 |
| article | 40 | mount | 10000 | 33.6 | 38.0 | 16.8 | 1.13 | 0.50 |
| article | 40 | mount+dispose | 10000 | 33.9 | 36.2 | 18.9 | 1.07 | 0.56 |

Break-even (template vs native, from cold and 1000-instance mount):

- tiny (2 nodes): template wins from the first mount
- profile (5 nodes): template wins from the first mount
- card (18 nodes): template wins from the first mount
- article (40 nodes): template pays off after ~2 mounts

## webkit

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15  
Timer resolution: 1000 µs

| scenario | nodes | metric | count | baseline | native | template | native/base | template/base |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| tiny | 2 | cold | 1 | 6.67 | 6.67 | 10.0 | 1.00 | 1.50 |
| tiny | 2 | mount | 100 | 1.50 | 1.25 | 1.00 | 0.83 | 0.67 |
| tiny | 2 | mount+dispose | 100 | 1.50 | 1.50 | 1.25 | 1.00 | 0.83 |
| tiny | 2 | mount | 1000 | 1.50 | 1.25 | 1.00 | 0.83 | 0.67 |
| tiny | 2 | mount+dispose | 1000 | 1.50 | 1.50 | 1.25 | 1.00 | 0.83 |
| tiny | 2 | mount | 10000 | 1.30 | 1.20 | 1.00 | 0.92 | 0.77 |
| tiny | 2 | mount+dispose | 10000 | 1.50 | 1.40 | 1.20 | 0.93 | 0.80 |
| profile | 5 | cold | 1 | 10.0 | 10.0 | 10.0 | 1.00 | 1.00 |
| profile | 5 | mount | 100 | 3.00 | 2.75 | 1.75 | 0.92 | 0.58 |
| profile | 5 | mount+dispose | 100 | 3.25 | 3.00 | 2.25 | 0.92 | 0.69 |
| profile | 5 | mount | 1000 | 3.00 | 2.75 | 1.75 | 0.92 | 0.58 |
| profile | 5 | mount+dispose | 1000 | 3.25 | 3.00 | 2.00 | 0.92 | 0.62 |
| profile | 5 | mount | 10000 | 3.40 | 3.00 | 1.90 | 0.88 | 0.56 |
| profile | 5 | mount+dispose | 10000 | 3.40 | 3.20 | 2.20 | 0.94 | 0.65 |
| card | 18 | cold | 1 | 20.0 | 20.0 | 20.0 | 1.00 | 1.00 |
| card | 18 | mount | 100 | 13.8 | 12.0 | 5.75 | 0.87 | 0.42 |
| card | 18 | mount+dispose | 100 | 14.0 | 12.3 | 6.25 | 0.88 | 0.45 |
| card | 18 | mount | 1000 | 13.5 | 12.0 | 5.50 | 0.89 | 0.41 |
| card | 18 | mount+dispose | 1000 | 17.3 | 12.5 | 6.00 | 0.72 | 0.35 |
| card | 18 | mount | 10000 | 15.6 | 14.1 | 6.90 | 0.90 | 0.44 |
| card | 18 | mount+dispose | 10000 | 16.5 | 14.7 | 7.30 | 0.89 | 0.44 |
| article | 40 | cold | 1 | 33.3 | 26.7 | 30.0 | 0.80 | 0.90 |
| article | 40 | mount | 100 | 28.3 | 20.3 | 8.50 | 0.72 | 0.30 |
| article | 40 | mount+dispose | 100 | 29.3 | 22.5 | 9.25 | 0.77 | 0.32 |
| article | 40 | mount | 1000 | 30.0 | 23.5 | 8.75 | 0.78 | 0.29 |
| article | 40 | mount+dispose | 1000 | 33.8 | 23.5 | 9.75 | 0.70 | 0.29 |
| article | 40 | mount | 10000 | 33.1 | 27.6 | 10.5 | 0.83 | 0.32 |
| article | 40 | mount+dispose | 10000 | 36.7 | 28.5 | 11.7 | 0.78 | 0.32 |

Break-even (template vs native, from cold and 1000-instance mount):

- tiny (2 nodes): template pays off after ~15 mounts
- profile (5 nodes): template wins from the first mount
- card (18 nodes): template wins from the first mount
- article (40 nodes): template pays off after ~2 mounts

## Bundle size

Minified bytes / gzip bytes. "app" bundles the scenario with reflex-dom (production, tree-shaken). The compiler runtime helper is 501 / 324 bytes.

| scenario | variant | module | app |
|---|---|---:|---:|
| tiny | baseline | 224 / 177 | 53680 / 18931 |
| tiny | native | 409 / 258 | 53897 / 18987 |
| tiny | template | 369 / 242 | 54220 / 19132 |
| profile | baseline | 294 / 215 | 53752 / 18955 |
| profile | native | 587 / 322 | 54073 / 19040 |
| profile | template | 479 / 293 | 54332 / 19174 |
| card | baseline | 674 / 374 | 54138 / 19116 |
| card | native | 1649 / 658 | 55127 / 19375 |
| card | template | 1143 / 562 | 55002 / 19466 |
| article | baseline | 897 / 429 | 54365 / 19166 |
| article | native | 2284 / 832 | 55756 / 19547 |
| article | template | 1462 / 660 | 55325 / 19561 |
