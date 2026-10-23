---
"@volynets/reflex-runtime": patch
---

A watcher is no longer handed to the host again while it validates itself. When a dependency recomputed during validation also feeds the watcher directly (for example, the watcher reads `fullName` before `firstName`), the watcher was queued a second time and ran an empty extra `runWatcher`; a validation failure in that pass failed twice per drain. The changed dependency is still recorded and consumed by the current run.
