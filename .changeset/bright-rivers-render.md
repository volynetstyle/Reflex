---
"@volynets/reflex": minor
"@volynets/reflex-framework": minor
"@volynets/reflex-dom": patch
"@reflex/vite-plugin": patch
---

Prepare the DOM renderer, framework ownership API, Reflex ranked effects, and
the shared Vite plugin for publication.

- expose ranked effects from the Reflex facade
- make ownership reactive helpers available from the main framework import
- move DOM JSX reactive-props transform into the shared Vite plugin
- simplify reflex-dom internals and remove the obsolete Vite peer dependency
