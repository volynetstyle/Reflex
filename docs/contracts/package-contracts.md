# Package and build contracts

The maintained registry is `tooling/build/package-registry.mjs`. It identifies eight product packages, two public tools, a private application and private research. A manifest being non-private is not the publication registry.

## Formats and identity

Runtime, Reflex and Async support ESM and CJS. Their declared formats, development conditions and type targets are qualified in separate consumer processes. Scheduler, Framework, Store, DOM and MCP are ESM-only; the infrastructure migration does not add a CJS UI API.

Runtime public/internal entrypoints share a graph per format and mode. The development debug graph is qualified under consistent development conditions. Mixed ESM/CJS sharing is not guaranteed.

DOM standalone and its JSX subpaths share a closed graph with no external ecosystem imports. Standalone state is intentionally isolated from the library composition.

## Artifacts

Archive verification checks actual tarball bytes, exported targets, bins, declaration/module closure, allowed external dependencies and unresolved production flags. A valid local dist directory is insufficient.

DOM publishes its finalized `dist/package.json` through `publishConfig.directory`. Tests must follow that publication root instead of assuming root npm packing is equivalent.

Reflex must include its development debug entrypoint and all shared chunks. CJS declaration targets must use the correct module kind. Consumer typechecks run with `skipLibCheck=false` and no workspace aliases.

## Behaviour

Packed consumers check:
- shared runtime context and producer identity;
- facade/async invalidation, settlement and disposal;
- compiled stores, action batching and lifecycle rollback boundaries;
- Store updates through DOM across eager, sab and flush delivery;
- SSR without DOM globals and browser hydration preserving nodes;
- cleanup and standalone isolation;
- MCP installed-bin transport and read-only diagnostics on a real graph.

## Diagnostics

Runtime kernel imports no SDK/schema/history registry code. Debug metadata remains behind the documented bridge. MCP uses the official SDK at the protocol boundary, preserving immutable diagnostic results without allocating protocol structures on kernel hot paths.

## Change policy

Build/configuration relocation preserves existing outputs and semantics unless an independent correction is recorded. Semantic defects receive focused regression tests. Test discovery loss, archive omission and active semantic divergences block release. Historical research bytes and frozen cohorts are protected separately from generated CI outputs.
