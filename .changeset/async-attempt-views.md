---
"@volynets/reflex": minor
---

Add an unstable async derivation experiment with separate commits and cancelable
attempts, fresh and committed reads, dependency blocking, latest-attempt
publication, ownership signals and awaitable resolution. Add explicit optimistic
transition scopes for async continuations and restore base dependencies after
equal-value optimistic cleanup. Build package entries together so the root and
unstable subpaths share runtime state.

Name the lossy committed-value projection `currentOrUndefined`, use commit
records for execution decisions, surface protocol violations separately from
data errors, and cache pending blockers per source revision. Validate the
existing state model with exhaustive bounded scenarios.

Add shrinking differential histories, diamond and dependency-removal contracts,
and isolated mutation qualification for the async implementation and reference
oracle. Correct inference for optimistic function derivations and their options.
