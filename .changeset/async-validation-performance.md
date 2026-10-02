---
"@volynets/reflex": patch
---

Reduce async derivation validation allocations without changing the fresh-read,
cancellation, publication or execution-capture contracts. Reuse callbacks and
avoid a redundant context wrapper for clean committed reads in their owning
runtime, while preserving upstream pulls and watcher/batch checkpoints.

Add production ESM before/after benchmarks and regression checks for upstream
capture order, upstream invalidation before cached reads and stale execution
handles. Preserve all seven mutation witnesses.
