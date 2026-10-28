# Regression corpus

Minimized programs of the program oracle, one JSON file each
(`testkit.counterexample`, schema in `testkit/lib/corpus.mjs`).
`oracle.corpus.test.ts` replays every file on the frozen baseline and the
working tree under the `baseline` policy of `../verdict.ts`:

- `"expect": "agree"`: the two sides must agree or have an accepted difference;
  an inconclusive outcome does not pass a committed regression.
- `"expect": "diverge"`: an open difference; the test fails once it stops
  diverging, so the entry moves to `agree` with the fixing commit.
- Optional `"class"` pins a particular accepted class; `"invariants": true`
  also requires the candidate's independent checks to pass.

## Entries

- `mutant-<id>.json`: the minimized program that kills oracle mutant `<id>`
  (`../mutants.ts`). It reaches the kernel decision the mutant changes, so
  replaying it checks that decision on every test run. `pnpm rt mutate` tries
  these witnesses before searching seeds; `pnpm rt mutate --record` writes
  new ones.
- `<family>-<seed>-<level>.json`: a divergence found by `pnpm rt diff`. Commit
  one after the fault is fixed, or after its acceptance rule is added, as the
  regression test of that change. `swarm-6476-strict.json` is the minimized
  F16 correction the swarm family found on 2026-10-27, the evidence for the
  F16 class of `../verdict.ts`.
- `default-2380-strict.json` and `default-3339-strict.json` cover watcher
  self-invalidation and its retained state after failure (F1 domain).
  `default-4326-observable.json` covers the F16 recovery that also preserves
  a scheduler claim; `default-12735-strict.json` covers a redundant F17
  notification rejected by a host that already owns the watcher.
- `hub-2301-reentry.json` and `default-13348-reentry.json` cover recursive
  evaluation through cleanup and a host hook; `hook-aborted-wave.json` checks
  the invariant checker's boundary after a throwing host hook. Structural
  checks still apply in all three programs.

Entries are evidence: add new ones, do not rewrite old ones. `origin` records
how an entry was found (command, family, seed, sides with their bundle hashes).
