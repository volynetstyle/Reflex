# @volynets/reflex-dom-compiler (experimental prototype)

A Babel plugin that runs **after** the regular JSX lowering and replaces
provably static host element subtrees (`jsx("section", {...})` whose props and
children are all literals) with specialized DOM construction:

- **template**: the subtree's HTML is parsed once into a `<template>` on first
  mount, then each mount is one `doc.importNode(root, true)`;
- **native**: a generated function builds it with `createElement`,
  `setAttribute`/`className`, `textContent` and `append`;
- **runtime**: anything the compiler cannot prove equivalent stays a normal
  `jsx(...)` call handled by `reflex-dom`, which remains the reference
  implementation.

Signals, components, ownership, scheduling, hydration and SSR are untouched.
The package is private and not wired into any build.

## Use

```js
// babel.config.js: after the JSX transform has produced jsx() calls
plugins: [["@volynets/reflex-dom-compiler", { strategy: "auto" }]]
```

```ts
import { transformReflexDOM, formatReport } from "@volynets/reflex-dom-compiler";

const { code, report } = transformReflexDOM(loweredModuleSource, { strategy: "template" });
console.log(formatReport(report));
```

| Option | Default | Meaning |
|---|---|---|
| `enabled` | `true` | `false` makes the plugin a no-op. A `// @reflex-dom-compiler off` comment does the same per file. |
| `strategy` | `"auto"` | `"native"` never parses HTML (strict CSP / Trusted Types). `"template"` uses templates wherever the parser reproduces the tree. `"auto"` uses templates from `templateThreshold` nodes up. |
| `templateThreshold` | `8` | Smallest region (elements + texts) that `auto` emits as a template. |
| `factorySources` | reflex-dom / reflex-framework JSX runtimes | Modules whose `jsx`/`jsxs`/`jsxDEV`/`Fragment` imports are trusted as the factory. |
| `renderSources` | `@volynets/reflex-dom` | Modules whose `render`/`mount` consume their first argument. |
| `assumePascalCaseComponents` | `true` | Treat PascalCase functions as components whose return value is mounted. |
| `onReport` | none | Receives the per-file report (also on Babel's `metadata.reflexDOMCompiler`). |

Every candidate region is explained:

```
Region #10 <p> (18:26)
  Static: yes
  Strategy: native
  Nodes: 3
  Reason: parser context: parser moved <div> out of <p>
```

## How a region is accepted

`src/classify.ts` holds every semantic decision; the emitters only print the
normalized tree (`src/model.ts`).

1. **Binding resolution.** The callee must resolve, through scope bindings, to
   a `jsx`/`jsxs`/`jsxDEV` import from a factory source. A local function
   named `jsx`, a shadowing parameter or another library's factory is ignored.
2. **Static.** The tag is in a supported set of plain HTML elements. Every prop
   and child is a literal, so building the subtree runs no user code and no
   evaluation moves in time. The key must be absent.
3. **Exactly one DOM effect per prop.** reflex-dom applies many props as DOM
   properties (`name in element`), so a prop compiles only where property and
   attribute paths store the same string in every engine: `class`/`className`,
   reflected string attributes (`id`, `title`, `lang`, `dir`, `role`, `alt`,
   `type`, `for`/`htmlFor`...), `data-*`/`aria-*` (with reflex-dom's boolean
   rules), `disabled`/`hidden`/`inert` as `true` only, and `href`/`src` only
   when reflex-dom's URL sanitizer would leave them unchanged. `style` (CSSOM
   normalization), events, refs, `tabIndex`, `width`, form-control values and
   unknown names are rejected with a reason.
4. **Exact text topology.** A scalar text child is assigned through
   `textContent` (an empty string creates no node). Array texts each become a
   node (an empty string creates an empty Text node). Numbers and bigints are
   formatted like `String()`.
5. **Escape analysis.** A compiled region replaces the element descriptor with
   an opaque one, so it is only legal where nothing can read `.kind`, `.tag` or
   `.props` of the original. That means positions that flow straight into the
   renderer: component returns (through `?:`, `&&`, arrays and sequences), host
   and Fragment children of consumed calls, and the first argument of
   `render`/`mount`. A descriptor stored in a variable, passed to a component or
   another function, or returned from a non-component helper stays on the
   runtime. Regions under `<svg>`/`<math>` also stay on the runtime.
6. **Parser verification (template only).** The serialized HTML is re-parsed
   with parse5 (the HTML fragment algorithm in a `<template>` context, which is
   what `template.innerHTML` runs) and compared node for node. Any difference
   (auto-closed `<p>`, nested `<a>`/`<button>`, merged or empty texts, CR
   normalization, children of void elements) demotes the region to native with
   a `parser context` reason.

## Runtime contract

Generated modules import two helpers from
`@volynets/reflex-dom-compiler/runtime` (~400 bytes minified):

```ts
compiled(create, fallback)
// { kind: Symbol.for("reflex-dom.compiled"), create(doc), fallback() }
// A fresh object per evaluation, like the jsx() call it replaces.

template(html)
// (doc) => Node | null. Parses lazily on first mount in the mount document's
// realm, then imports a deep copy per mount.
```

`reflex-dom` recognizes the descriptor kind
(`src/renderable/compiled.ts`; internal, not exported). The changes are three
cases in the existing dispatch switches:

- **client mount** (`mount/append.ts`): `create(doc)` with the mount document,
  only when the parent namespace is HTML; otherwise, or when `create` returns
  `null`, it mounts `fallback()`;
- **hydration** and **SSR**: always `fallback()`, so both keep their existing
  behaviour exactly.

`fallback()` returns the original `jsx(...)` tree, hoisted into a module-level
function. It only contains literals, so evaluating it later observes nothing.

**Trusted Types / CSP.** The template is parsed in the mount document's own
realm. Under `require-trusted-types-for 'script'` the parse is refused (a
reported violation), `template()` returns `null` and the region mounts through
the runtime. The policy is never bypassed. `strategy: "native"` needs no HTML
parsing at all.

## Correctness gate

`pnpm test` (jsdom) and `pnpm test:browser` (Chromium, Firefox and WebKit via
Playwright; `REFLEX_BROWSERS=chromium` narrows the matrix).

- `test/transform.test.ts`: binding resolution, evaluation timing, escape
  analysis, every prop rule, text topology, parser demotion, strategy
  selection, off switches, diagnostics.
- `test/differential/`: every fixture in `test/fixtures/` is compiled by the
  real JSX pipeline (esbuild) into `baseline`, `native`, `template` and `auto`
  variants and mounted in independent containers. The test compares DOM
  topology, namespaces, attributes (with namespaces and order), exact Text
  boundaries, reflected properties, `ownerDocument` and `innerHTML`, and checks
  that dispose empties the container. It runs in the main document and a
  detached document (jsdom) or an iframe document (browsers). The fixtures
  include the plan's negative corpus (table, `select value`, svg
  `foreignObject`, custom element with ref), which must not compile at all.
- `test/fuzz/`: fast-check generates lowered `jsx(...)` trees: supported and
  hostile tags (table, select, pre, textarea, svg, custom elements), every prop
  form including rejected ones, and text with `& < > " \r \n` NBSP and emoji. It
  asserts every variant mounts the baseline DOM. 300 runs in jsdom
  (`REFLEX_FUZZ_RUNS` to change) and 150 per browser, with shrinking. The run
  also asserts that template, native and runtime strategies were all exercised.
- `test/bridge.test.ts`: SSR and hydration through `fallback()` (server nodes
  adopted, DOM identical to the baseline), parse-once templates, fresh nodes
  per mount, `create` → `null` fallback, namespace re-check, mount-document
  ownership.
- `test/security.browser.test.ts` (Chromium): in a Trusted Types iframe,
  template regions fall back with identical DOM and a reported violation, and
  native regions trigger no violation.

## Benchmarks

`pnpm bench` (`-- --browsers=chromium --quick` for a short run). Scenario
modules in `bench/scenarios/` are compiled three ways and run in a page bundled
from source with production flags. Results go to `bench/results/latest.{md,json}`.

Results from 2026-10-19 (Windows 10, headless Playwright builds of
Chromium 151, Firefox 153 and WebKit 26.5; full tables in
`bench/results/latest.md`). Ratios are variant ÷ baseline reflex-dom, median
of 11 samples; lower is faster.

| | tiny (2 nodes) | profile (5) | card (18) | article (40) |
|---|---:|---:|---:|---:|
| **Warm mount, 1000 instances: native** | | | | |
| Chromium | 0.88 | 0.82 | 0.82 | 0.68 |
| Firefox | 1.00 | 0.76 | 0.89 | 1.11 |
| WebKit | 1.00 | 0.91 | 0.83 | 0.76 |
| **Warm mount, 1000 instances: template** | | | | |
| Chromium | 0.72 | 0.64 | 0.46 | 0.40 |
| Firefox | 0.80 | 0.41 | 0.39 | 0.39 |
| WebKit | 0.75 | 0.45 | 0.28 | 0.22 |
| **Cold first mount: template** (includes the parse) | | | | |
| Chromium | 2.14 | 1.80 | 1.69 | 1.26 |
| Firefox | 1.33 | 0.67 | 0.62 | 0.58 |
| WebKit | 2.00 | 2.00 | 1.25 | 0.93 |
| **Mounts until template beats native** | | | | |
| Chromium | ~28 | ~14 | ~4 | ~3 |
| Firefox | 1 | 1 | 1 | 1 |
| WebKit | ~15 | ~4 | ~2 | ~2 |

Mount + dispose follows the warm-mount ratios. Other observations:

- **Template is the strategy that pays.** Warm, it is 1.5–4.5× faster than
  the baseline at 5+ nodes in every engine. Native only removes reflex-dom's
  per-prop and per-child dispatch: 0–32% in Chromium and WebKit, growing with
  region size, and roughly parity in Firefox, where the DOM calls themselves
  dominate.
- **Threshold.** At 18+ nodes a template pays back its parse within ≤4 mounts
  in every engine. At 5 nodes Chromium needs ~14. `auto` therefore keeps
  native below 8 nodes. The compiler cannot see how often a region mounts;
  regions inside list render callbacks are the obvious next refinement.
- **Memory.** JS heap retained while mounted (Chromium, per instance): baseline
  80 / 328 / 1220 / 2501 bytes, native 56 / 88 / 216 / 384, template 56 / 56 /
  56 / 48. A cloned template creates a JS wrapper for its root only.
  Post-dispose residuals are not reported: `bench/memory-probe.ts` reproduces
  the same per-cycle heap growth (~16 bytes per JS-wrapped element) with plain
  DOM code and no Reflex at all. It is therefore not attributable to Reflex or
  to the compiler.
- **Size.** Each compiled region keeps its `jsx(...)` source as the fallback
  (needed for SSR, hydration and foreign namespaces), so compiled modules are
  larger. Gzipped app bundles grow by +45 / +79 / +259 / +377 bytes (native) and
  +193 / +227 / +357 / +401 bytes (template, including the ~320-byte helper).
- **Caveats.** Firefox and WebKit expose a 1 ms timer here. Cold samples batch
  300 mounts, so they move in ~3.3 µs steps. "Cold" is the first mount of a
  freshly evaluated region in an already warm runtime: it measures region
  preparation, not page start-up.

## Status against the plan's acceptance checklist

- [x] Ordinary JSX still lowers to the same `jsx(...)` calls. The compiler is
  an opt-in pass after that, and reflex-dom's public API is unchanged (the
  bridge type is internal).
- [x] Static trees compile through two independent strategies (native and
  template).
- [x] Every supported transformation passes differential tests in Chromium,
  Firefox and WebKit: 11 fixtures × 4 variants × 2 documents, plus 150
  generated trees per engine and 300 in jsdom.
- [x] Unsupported cases stay on the runtime. The plan's negative corpus is
  asserted to compile nothing, and every fallback carries a reason.
- [x] No user code moves in time: only literal-only regions compile. Refs and
  events are rejected. Escape analysis keeps the descriptor unobservable, and
  the observable DOM (including `ownerDocument`) is compared. Two
  assumptions remain: PascalCase functions are components (switchable), and
  MutationObserver record sequences are not compared.
- [x] Benchmarks are reproducible with `pnpm bench`, and sizes are measured.
- [x] Everything switches off without touching application code
  (`enabled: false`, or `strategy` per build).

## Not done yet

- Stage 4 (dynamic slots inside static templates) and anything reactive.
- The integration-level keyed 1k/10k benchmark; only isolated DOM
  microbenchmarks exist so far.
- Lifecycle, event and ref rows of the differential matrix: those props are
  rejected, so for now the tests assert that they stay on the runtime.
