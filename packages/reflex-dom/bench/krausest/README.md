# reflex-dom in the official js-framework-benchmark tables

Runs the official harness of a
[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
release with reflex-dom added locally, and places reflex-dom in that release's
CPU, memory and size tables. Nothing is sent to the official repository.

Workflow: `.github/workflows/krausest-ranking.yml` (manual dispatch; inputs
`release`, default `chrome154`, `count` and `headless`).

## How

1. Every shard runs on a macOS arm64 runner with the release's Chrome
   milestone (Chrome for Testing), the release's harness (`webdriver-ts`,
   puppeteer runner, official settings: 15 CPU iterations, warmups, CPU
   throttling, headed browser) and its server with the official stylesheet.
2. Every shard runs `keyed/vanillajs` (prebuilt, from the release's
   `build.zip`) and `keyed/reflex-dom`. By default nothing else: the run
   compares reflex-dom with vanilla only. Further reference frameworks of the
   release can be listed in `anchors.json` (one array per parallel shard); with
   vanillajs as the only anchor the ranking uses the ratio model.
3. `build.mjs` builds reflex-dom into `frameworks/keyed/reflex-dom` of the
   checkout: the application of `../js-framework`, a page that loads the
   official stylesheet.
4. `rank.mjs` maps the runner onto the official machine. For every benchmark
   and shard it fits the official means of the anchors against their local
   means, `official = k · local` (ratio) and `official = a + c · local`
   (linear, which also absorbs a fixed cost such as paint), applies the fit to
   reflex-dom, inserts the estimate into the complete official table and
   computes the place like the results app does: factor against the best mean
   per benchmark, weighted geometric mean (official CPU weights; weight 1 for
   memory and size). Uncompressed and compressed sizes are bytes and are used
   as measured.

`ranking.md` (job summary and `krausest-ranking` artifact) lists the place per
table and model, the fit error per benchmark, and the order of all frameworks
measured on the runner next to their official places, which shows how well the
runner reproduces the official order.

## Locally

```sh
pnpm --filter "@volynets/reflex-dom..." build
node build.mjs <js-framework-benchmark>/frameworks/keyed/reflex-dom
# in the checkout: npm start, then
#   npm run bench -- --framework keyed/vanillajs keyed/reflex-dom ...
node rank.mjs --official <checkout>/webdriver-ts-results/src/results.ts \
  --results <dir with one subdirectory of result files per shard>
```

## Limits

- The place of an entry that is not in the official run is an estimate. Its
  quality is shown by the fit error and by the anchors' order on the runner;
  with vanillajs alone it is a plain rescaling through one framework (the run
  of 2026-10-18 with 17 anchors placed reflex-dom at about 125/197 in CPU,
  88 in memory and 113 in size).
- Startup metrics (`30_startup`, Lighthouse) are not run; the size table's
  first paint is calibrated like the CPU benchmarks.
- Hosted runners are shared virtual machines. Anchors in the same shard are
  measured under the same conditions as reflex-dom, which is why every shard
  carries its own reference frameworks.
