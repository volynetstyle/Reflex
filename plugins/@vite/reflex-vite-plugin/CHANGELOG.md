# @volynets/reflex-vite-plugin

## 0.0.3

### Patch Changes

- 6096f73: Prepare the DOM renderer, framework ownership API, Reflex ranked effects, and
  the shared Vite plugin for publication.
  - expose ranked effects from the Reflex facade
  - add render-phase effects for layout-safe host updates
  - make ownership reactive helpers available from the main framework import
  - move DOM JSX reactive-props transform into the shared Vite plugin
  - simplify reflex-dom internals and remove the obsolete Vite peer dependency
