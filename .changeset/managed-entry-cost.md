---
"@volynets/reflex-runtime": patch
---

Execution domain entry is cheaper. `domain.batch(fn)` and `domain.run(fn)` invoke the callback directly and inline into their caller, so a callback closure such as `batch(() => write())` is no longer allocated per call; a public `batch` around one write costs about half as much. Behavior is unchanged. The `state`, `closed`, `signal` and `depth` accessors now live on the domain's prototype, so `Object.keys(domain)` no longer lists them; the operations remain own properties and work detached.
