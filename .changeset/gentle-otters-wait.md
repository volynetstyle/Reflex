---
"@volynets/reflex-runtime": patch
"@volynets/reflex": patch
---

Align the Rollup output layout with published package exports, emit real `.cjs`
entry points for CommonJS consumers, and make the public `reflex` type output
self-contained so it no longer depends on `@reflex/runtime` declarations at
install time.
