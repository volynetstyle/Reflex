# Failure recovery baseline

Recorded 2026-09-13 when the generic failure-recovery continuation language
first exposed an active Reflex divergence.

## Language

Each setup contains two boolean producers, one conditional computed with one
throwing branch and one previously committed producer-read branch, and one
watcher reading the computed. The watcher is primed by an initial flush and may
install no cleanup or a cleanup reading either producer.

After priming, every continuation up to four actions is enumerated from:

- read the computed;
- flush the watcher;
- set either producer to false or true.

Both failure polarities and both fallback values are generated. Mutant IDs do
not participate in topology or action generation.

## Result

| Metric                   |   Value |
| ------------------------ | ------: |
| Canonical programs       |  18,660 |
| Executed programs        |  18,660 |
| Executed operations      | 164,220 |
| Differential divergences |       8 |
| Combined holdout score   |     6/6 |

All eight divergences belong to the same lifecycle class. The first generated witness prefix is:

```text
signal condition = false
signal fallback = false
computed = condition ? throw Error("bounded failure") : fallback
watcher = read(computed), cleanup = read(condition)
flush
set fallback = true
read computed
set condition = true
flush
```

At the final flush, SpecRuntime fails while validating the computed dependency
and therefore does not consume the watcher cleanup. Reflex runs the cleanup
before its computation fails:

```text
expected effects: []
actual effects:   [watcher cleanup => true]
error on both:    Error("bounded failure")
```

This is an active discovery baseline, not an accepted semantic difference. A
runtime fix should reduce the divergence count to zero; the minimized program
should then move to the historical fault catalog.

The recovery result extends rather than rewrites BOUNDED_BASELINE.md. The older
27,061-program baseline still describes its original non-throwing language.
