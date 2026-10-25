# DOM compiler benchmark

2026-10-19T12:27:46.078Z. Commit `feaf05432d`, corpus `d66481ec83f3`.

Each instance is one row of reflex-dom's `For` whose callback returns the scenario tree. Median µs per mounted instance; ratio is variant / baseline (lower is faster).

## chromium

Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.7922.34 Safari/537.36  
Timer resolution: 100.0 µs

| scenario | nodes | metric | count | baseline | native | template | native/base | template/base |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| tiny | 2 | cold | 1 | 5.00 | 4.33 | 9.33 | 0.87 | 1.87 |
| tiny | 2 | mount | 100 | 0.85 | 0.83 | 0.67 | 0.97 | 0.79 |
| tiny | 2 | mount+dispose | 100 | 0.97 | 0.95 | 0.92 | 0.97 | 0.95 |
| tiny | 2 | mount | 1000 | 0.77 | 0.73 | 0.67 | 0.94 | 0.87 |
| tiny | 2 | mount+dispose | 1000 | 0.92 | 0.90 | 0.83 | 0.97 | 0.89 |
| tiny | 2 | mount | 10000 | 0.80 | 0.83 | 0.73 | 1.04 | 0.91 |
| tiny | 2 | mount+dispose | 10000 | 1.02 | 0.95 | 0.85 | 0.93 | 0.83 |
| profile | 5 | cold | 1 | 5.67 | 5.67 | 9.33 | 1.00 | 1.65 |
| profile | 5 | mount | 100 | 1.95 | 1.67 | 1.25 | 0.86 | 0.64 |
| profile | 5 | mount+dispose | 100 | 1.98 | 1.80 | 1.42 | 0.91 | 0.72 |
| profile | 5 | mount | 1000 | 2.05 | 1.65 | 1.20 | 0.80 | 0.59 |
| profile | 5 | mount+dispose | 1000 | 1.85 | 1.80 | 1.38 | 0.97 | 0.74 |
| profile | 5 | mount | 10000 | 1.87 | 1.70 | 1.31 | 0.91 | 0.70 |
| profile | 5 | mount+dispose | 10000 | 1.99 | 1.80 | 1.50 | 0.90 | 0.75 |
| row | 10 | cold | 1 | 8.67 | 9.33 | 14.3 | 1.08 | 1.65 |
| row | 10 | mount | 100 | 5.15 | 4.80 | 3.58 | 0.93 | 0.69 |
| row | 10 | mount+dispose | 100 | 5.70 | 5.47 | 4.70 | 0.96 | 0.82 |
| row | 10 | mount | 1000 | 5.30 | 4.85 | 3.85 | 0.92 | 0.73 |
| row | 10 | mount+dispose | 1000 | 6.88 | 5.80 | 5.00 | 0.84 | 0.73 |
| row | 10 | mount | 10000 | 5.75 | 5.61 | 4.13 | 0.98 | 0.72 |
| row | 10 | mount+dispose | 10000 | 6.72 | 6.08 | 5.02 | 0.90 | 0.75 |
| card | 18 | cold | 1 | 12.3 | 11.0 | 18.7 | 0.89 | 1.51 |
| card | 18 | mount | 100 | 8.50 | 6.42 | 3.92 | 0.76 | 0.46 |
| card | 18 | mount+dispose | 100 | 8.68 | 7.27 | 4.72 | 0.84 | 0.54 |
| card | 18 | mount | 1000 | 7.80 | 6.72 | 4.13 | 0.86 | 0.53 |
| card | 18 | mount+dispose | 1000 | 9.05 | 7.15 | 4.92 | 0.79 | 0.54 |
| card | 18 | mount | 10000 | 9.09 | 7.27 | 4.12 | 0.80 | 0.45 |
| card | 18 | mount+dispose | 10000 | 9.54 | 8.41 | 5.07 | 0.88 | 0.53 |
| article | 40 | cold | 1 | 19.3 | 16.3 | 24.3 | 0.84 | 1.26 |
| article | 40 | mount | 100 | 16.7 | 12.5 | 8.00 | 0.75 | 0.48 |
| article | 40 | mount+dispose | 100 | 16.1 | 14.1 | 8.35 | 0.87 | 0.52 |
| article | 40 | mount | 1000 | 17.9 | 12.5 | 8.38 | 0.70 | 0.47 |
| article | 40 | mount+dispose | 1000 | 17.2 | 13.5 | 8.55 | 0.79 | 0.50 |
| article | 40 | mount | 10000 | 18.5 | 15.6 | 9.76 | 0.84 | 0.53 |
| article | 40 | mount+dispose | 10000 | 20.0 | 16.6 | 9.23 | 0.83 | 0.46 |

Break-even (template vs native, from cold and 1000-instance mount):

- tiny (2 nodes): template pays off after ~101 mounts
- profile (5 nodes): template pays off after ~10 mounts
- row (10 nodes): template pays off after ~7 mounts
- card (18 nodes): template pays off after ~4 mounts
- article (40 nodes): template pays off after ~3 mounts

JS heap retained while mounted, per instance (Chromium, fresh page, median of 5 rounds of 10000 instances). Post-dispose residuals are not reported: `bench/memory-probe.ts` reproduces the same per-cycle growth with plain DOM code and no Reflex.

| scenario | variant | bytes/instance |
|---|---|---:|
| tiny | baseline | 245 |
| tiny | native | 222 |
| tiny | template | 222 |
| profile | baseline | 486 |
| profile | native | 254 |
| profile | template | 222 |
| row | baseline | 1753 |
| row | native | 1232 |
| row | template | 1199 |
| card | baseline | 774 |
| card | native | 382 |
| card | template | 222 |
| article | baseline | 905 |
| article | native | 540 |
| article | template | 199 |

## firefox

Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0  
Timer resolution: 1000 µs

| scenario | nodes | metric | count | baseline | native | template | native/base | template/base |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| tiny | 2 | cold | 1 | 23.3 | 30.0 | 26.7 | 1.29 | 1.14 |
| tiny | 2 | mount | 100 | 2.00 | 2.00 | 1.50 | 1.00 | 0.75 |
| tiny | 2 | mount+dispose | 100 | 2.25 | 2.00 | 1.75 | 0.89 | 0.78 |
| tiny | 2 | mount | 1000 | 1.75 | 1.75 | 1.25 | 1.00 | 0.71 |
| tiny | 2 | mount+dispose | 1000 | 2.25 | 2.00 | 1.75 | 0.89 | 0.78 |
| tiny | 2 | mount | 10000 | 1.80 | 1.70 | 1.40 | 0.94 | 0.78 |
| tiny | 2 | mount+dispose | 10000 | 2.20 | 1.90 | 1.70 | 0.86 | 0.77 |
| profile | 5 | cold | 1 | 30.0 | 40.0 | 30.0 | 1.33 | 1.00 |
| profile | 5 | mount | 100 | 3.75 | 3.75 | 2.50 | 1.00 | 0.67 |
| profile | 5 | mount+dispose | 100 | 4.25 | 4.50 | 3.00 | 1.06 | 0.71 |
| profile | 5 | mount | 1000 | 3.50 | 4.00 | 2.25 | 1.14 | 0.64 |
| profile | 5 | mount+dispose | 1000 | 4.00 | 4.00 | 2.75 | 1.00 | 0.69 |
| profile | 5 | mount | 10000 | 3.70 | 4.00 | 2.50 | 1.08 | 0.68 |
| profile | 5 | mount+dispose | 10000 | 4.50 | 4.40 | 2.90 | 0.98 | 0.64 |
| row | 10 | cold | 1 | 53.3 | 63.3 | 53.3 | 1.19 | 1.00 |
| row | 10 | mount | 100 | 11.8 | 11.8 | 8.00 | 1.00 | 0.68 |
| row | 10 | mount+dispose | 100 | 13.3 | 12.3 | 9.50 | 0.92 | 0.72 |
| row | 10 | mount | 1000 | 12.0 | 12.8 | 8.25 | 1.06 | 0.69 |
| row | 10 | mount+dispose | 1000 | 13.5 | 13.3 | 9.50 | 0.98 | 0.70 |
| row | 10 | mount | 10000 | 12.2 | 12.5 | 9.20 | 1.02 | 0.75 |
| row | 10 | mount+dispose | 10000 | 12.8 | 13.5 | 10.5 | 1.05 | 0.82 |
| card | 18 | cold | 1 | 63.3 | 73.3 | 43.3 | 1.16 | 0.68 |
| card | 18 | mount | 100 | 17.5 | 16.5 | 8.25 | 0.94 | 0.47 |
| card | 18 | mount+dispose | 100 | 19.0 | 17.5 | 9.00 | 0.92 | 0.47 |
| card | 18 | mount | 1000 | 17.5 | 16.5 | 8.25 | 0.94 | 0.47 |
| card | 18 | mount+dispose | 1000 | 18.0 | 18.0 | 9.75 | 1.00 | 0.54 |
| card | 18 | mount | 10000 | 18.5 | 17.3 | 8.70 | 0.94 | 0.47 |
| card | 18 | mount+dispose | 10000 | 18.4 | 18.4 | 10.1 | 1.00 | 0.55 |
| article | 40 | cold | 1 | 96.7 | 103 | 56.7 | 1.07 | 0.59 |
| article | 40 | mount | 100 | 29.0 | 31.8 | 14.5 | 1.09 | 0.50 |
| article | 40 | mount+dispose | 100 | 34.3 | 35.0 | 16.3 | 1.02 | 0.47 |
| article | 40 | mount | 1000 | 30.5 | 32.5 | 15.0 | 1.07 | 0.49 |
| article | 40 | mount+dispose | 1000 | 33.8 | 38.5 | 18.8 | 1.14 | 0.56 |
| article | 40 | mount | 10000 | 33.4 | 38.2 | 16.9 | 1.14 | 0.51 |
| article | 40 | mount+dispose | 10000 | 37.0 | 40.2 | 22.6 | 1.09 | 0.61 |

Break-even (template vs native, from cold and 1000-instance mount):

- tiny (2 nodes): template wins from the first mount
- profile (5 nodes): template wins from the first mount
- row (10 nodes): template wins from the first mount
- card (18 nodes): template wins from the first mount
- article (40 nodes): template wins from the first mount

## webkit

Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15  
Timer resolution: 1000 µs

| scenario | nodes | metric | count | baseline | native | template | native/base | template/base |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| tiny | 2 | cold | 1 | 10.0 | 10.0 | 13.3 | 1.00 | 1.33 |
| tiny | 2 | mount | 100 | 1.25 | 1.25 | 1.00 | 1.00 | 0.80 |
| tiny | 2 | mount+dispose | 100 | 1.75 | 1.50 | 1.25 | 0.86 | 0.71 |
| tiny | 2 | mount | 1000 | 1.25 | 1.25 | 1.00 | 1.00 | 0.80 |
| tiny | 2 | mount+dispose | 1000 | 1.50 | 1.50 | 1.25 | 1.00 | 0.83 |
| tiny | 2 | mount | 10000 | 1.90 | 1.30 | 1.10 | 0.68 | 0.58 |
| tiny | 2 | mount+dispose | 10000 | 1.50 | 1.60 | 1.30 | 1.07 | 0.87 |
| profile | 5 | cold | 1 | 10.0 | 10.0 | 13.3 | 1.00 | 1.33 |
| profile | 5 | mount | 100 | 2.75 | 2.75 | 1.75 | 1.00 | 0.64 |
| profile | 5 | mount+dispose | 100 | 3.25 | 3.00 | 2.00 | 0.92 | 0.62 |
| profile | 5 | mount | 1000 | 3.00 | 2.75 | 1.75 | 0.92 | 0.58 |
| profile | 5 | mount+dispose | 1000 | 3.25 | 3.00 | 2.00 | 0.92 | 0.62 |
| profile | 5 | mount | 10000 | 3.00 | 2.90 | 1.80 | 0.97 | 0.60 |
| profile | 5 | mount+dispose | 10000 | 3.30 | 3.20 | 2.00 | 0.97 | 0.61 |
| row | 10 | cold | 1 | 13.3 | 16.7 | 20.0 | 1.25 | 1.50 |
| row | 10 | mount | 100 | 11.5 | 10.3 | 6.50 | 0.89 | 0.57 |
| row | 10 | mount+dispose | 100 | 11.5 | 10.8 | 7.25 | 0.93 | 0.63 |
| row | 10 | mount | 1000 | 9.75 | 8.75 | 6.50 | 0.90 | 0.67 |
| row | 10 | mount+dispose | 1000 | 9.25 | 11.0 | 7.25 | 1.19 | 0.78 |
| row | 10 | mount | 10000 | 10.6 | 10.0 | 7.90 | 0.94 | 0.75 |
| row | 10 | mount+dispose | 10000 | 11.3 | 11.5 | 8.80 | 1.02 | 0.78 |
| card | 18 | cold | 1 | 23.3 | 20.0 | 30.0 | 0.86 | 1.29 |
| card | 18 | mount | 100 | 13.3 | 13.5 | 5.75 | 1.02 | 0.43 |
| card | 18 | mount+dispose | 100 | 13.8 | 12.3 | 6.50 | 0.89 | 0.47 |
| card | 18 | mount | 1000 | 13.8 | 11.3 | 5.50 | 0.82 | 0.40 |
| card | 18 | mount+dispose | 1000 | 14.5 | 12.5 | 6.25 | 0.86 | 0.43 |
| card | 18 | mount | 10000 | 15.4 | 13.3 | 6.30 | 0.86 | 0.41 |
| card | 18 | mount+dispose | 10000 | 17.3 | 14.5 | 7.00 | 0.84 | 0.40 |
| article | 40 | cold | 1 | 40.0 | 46.7 | 40.0 | 1.17 | 1.00 |
| article | 40 | mount | 100 | 29.3 | 21.0 | 8.00 | 0.72 | 0.27 |
| article | 40 | mount+dispose | 100 | 29.3 | 23.0 | 9.25 | 0.79 | 0.32 |
| article | 40 | mount | 1000 | 27.8 | 23.0 | 8.50 | 0.83 | 0.31 |
| article | 40 | mount+dispose | 1000 | 30.8 | 24.0 | 9.50 | 0.78 | 0.31 |
| article | 40 | mount | 10000 | 32.0 | 24.6 | 9.90 | 0.77 | 0.31 |
| article | 40 | mount+dispose | 10000 | 34.1 | 27.9 | 11.4 | 0.82 | 0.33 |

Break-even (template vs native, from cold and 1000-instance mount):

- tiny (2 nodes): template pays off after ~15 mounts
- profile (5 nodes): template pays off after ~5 mounts
- row (10 nodes): template pays off after ~3 mounts
- card (18 nodes): template pays off after ~3 mounts
- article (40 nodes): template wins from the first mount

## Bundle size

Minified bytes / gzip bytes. "app" bundles the scenario with reflex-dom (production, tree-shaken). The compiler runtime helper is 902 / 508 bytes.

| scenario | variant | module | app |
|---|---|---:|---:|
| tiny | baseline | 224 / 177 | 59293 / 20516 |
| tiny | native | 409 / 258 | 59663 / 20609 |
| tiny | template | 369 / 242 | 59986 / 20753 |
| profile | baseline | 294 / 215 | 59365 / 20538 |
| profile | native | 587 / 322 | 59839 / 20661 |
| profile | template | 479 / 293 | 60098 / 20803 |
| row | baseline | 426 / 247 | 59499 / 20594 |
| row | native | 1071 / 484 | 60513 / 20863 |
| row | template | 879 / 454 | 60694 / 20994 |
| card | baseline | 674 / 374 | 59749 / 20703 |
| card | native | 1649 / 658 | 60891 / 20989 |
| card | template | 1143 / 562 | 60766 / 21085 |
| article | baseline | 897 / 429 | 59973 / 20761 |
| article | native | 2284 / 832 | 61519 / 21171 |
| article | template | 1462 / 660 | 61086 / 21184 |
