# @volynets/reflex-dom-compiler (experimental prototype)

A Babel plugin that runs **after** the regular JSX lowering and replaces
host element subtrees whose props are literals (`jsx("section", {...})`), with
at most one dynamic child, by specialized DOM construction. The browser builds
the structure; the dynamic child is handed to reflex-dom's own binding:

- **template**: the subtree's HTML is parsed once into a `<template>` on first
  mount, then each mount is one `doc.importNode(root, true)`;
- **native**: a generated function builds it with `createElement`,
  `setAttribute`/`className`, `textContent` and `append`;
- **runtime**: anything the compiler cannot prove equivalent stays a normal
  `jsx(...)` call handled by `reflex-dom`, which remains the reference
  implementation.

Signals, components, ownership, scheduling, hydration and SSR are untouched.
The package is private (registered as a research package with PR quality
checks) and not wired into any build.

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
| `strategy` | `"auto"` | `"native"` never parses HTML (strict CSP / Trusted Types). `"template"` uses templates wherever the parser reproduces the tree. `"auto"` uses templates from `AUTO_TEMPLATE_MIN_NODES` up. |
| `autoTemplateMinNodes` | `AUTO_TEMPLATE_MIN_NODES` (8) | Overrides the steady-state heuristic below. |
| `factorySources` | reflex-dom / reflex-framework JSX runtimes | Modules whose `jsx`/`jsxs`/`jsxDEV`/`Fragment` imports are trusted as the factory. |
| `renderSources` | `@volynets/reflex-dom` | Modules whose `render`/`mount`/`hydrate`/`renderToString` render their first argument. |
| `operatorSources` | `@volynets/reflex-dom` | Modules whose `For` mounts what its `children` callback returns. |
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

Every decision is a proof; nothing is inferred from names. `src/classify.ts`
reads the AST, `src/semantics.ts` holds the DOM meaning of static values, and
the emitters only print the normalized tree (`src/model.ts`).

1. **Binding resolution.** The callee must resolve, through scope bindings, to
   a `jsx`/`jsxs`/`jsxDEV` import from a factory source. A local function
   named `jsx`, a shadowing parameter or another library's factory is ignored.
2. **Static.** The tag is in a supported set of plain HTML elements. Every prop
   and child is a literal, so building the subtree runs no user code and no
   evaluation moves in time. The key must be absent.
3. **Exactly one DOM effect per prop.** reflex-dom applies many props through
   DOM properties (`name in element`), whose setters differ between engines.
   A prop compiles only where the runtime ends with exactly the attribute the
   compiler writes, and that is **checked, not assumed**:
   `test/semantics.conformance.*` mounts every compilable tag × accepted prop ×
   26 values through the real runtime in jsdom, Chromium, Firefox and WebKit.
   That check removed `type`: `fieldset.type` is getter-only, so the runtime
   throws, and jsdom normalizes `button.type` to `"submit"`. Two props that
   touch the same attribute (`className`/`class`, `htmlFor`/`for`) are
   rejected even when one only removes it, because a later removal undoes an
   earlier write. `style` (CSSOM normalization), events, refs, `tabIndex`,
   `width`, form-control values and unknown names are rejected with a reason.
4. **Exact text topology.** A scalar text child is assigned through
   `textContent` (an empty string creates no node). Array texts each become a
   node (an empty string creates an empty Text node). Numbers and bigints are
   formatted like `String()`.
5. **Escape analysis.** A compiled region replaces the element descriptor with
   an opaque one, so the descriptor must provably reach the renderer and
   nothing else. Values flow through `?:`, `&&`/`||`, arrays and sequences,
   and through the `children` of host elements and Fragments, into one of
   these consumers:
   - the first argument of `render`/`mount`/`hydrate`/`renderToString`;
   - what reflex-dom's `For` mounts: its `children` callback result and its
     `fallback`, when the `jsx(For, ...)` call is itself consumed;
   - the return value of a function whose callers are all the renderer: a
     constant, unexported binding whose every reference is the type of a
     consumed `jsx(F, ...)` call (recursively; a recursive component is not
     proven).

   An exported component, one called directly or passed as a value, a
   descriptor stored in a variable or passed to a component, and anything
   under `<svg>`/`<math>` stays on the runtime with the reason in the report.
6. **Parser verification (template only).** The serialized HTML is re-parsed
   with parse5 (the HTML fragment algorithm in a `<template>` context, which is
   what `template.innerHTML` runs) and compared node for node. Any difference
   (auto-closed `<p>`, nested `<a>`/`<button>`, merged or empty texts, CR
   normalization, children of void elements) demotes the region to native with
   a `parser context` reason.

### What the strict proof costs

On the repo's mini-app (`packages/reflex/examples/mini-app`, 11 files) **no
region compiles**. With holes, more regions qualify structurally, and the
consumer proof becomes the main blocker: of 100 host regions, 54 fail it (38
inside functions referenced other than as a JSX type, 8 returned from
functions with unknown callers, 4 stored in objects, and others). 26 stop at
a component boundary, 9 have more than one dynamic child, and 12 use props or
elements without verified semantics. Before holes, 24 static regions failed
the proof. That is the intended trade-off: undercompile rather than guess.
Provable ways to recover coverage are listed under "Ideas".

## Compiled-region protocol

`Compiled` is reflex-dom's internal optimization form
(`packages/reflex-dom/src/renderable/compiled.ts`, not exported). The renderer
knows this protocol and nothing about the compiler:

| situation | renderer calls |
|---|---|
| client mount, HTML namespace | `create(doc, mountHole)` with the mount document |
| client mount, any other namespace | `fallback()` |
| `create` returns `null` (unsupported environment or hole value, refused before any observable DOM mutation) | `fallback()` |
| hydration | `fallback()` |
| SSR (`renderToString`) | `fallback()` |

Exceptions from `create` propagate like any mount error. reflex-dom tests the
protocol with hand-written regions (`test/render.compiled-protocol.test.tsx`).

The generated code imports its helpers from
`@volynets/reflex-dom-compiler/runtime` (~500 bytes gzipped):

```ts
compiled(create, fallback, holes?)
// A CompiledRegion { kind: Symbol.for("reflex-dom.compiled"), create, fallback }:
// one fresh object per evaluation, like the jsx() call it replaces, carrying
// the hole values computed at that moment.

template(html)
// (doc) => Node | null. Parses lazily on first mount in the mount document's
// realm, then imports a deep copy per mount; null for non-HTML documents.

acceptsHoles(values)
// Whether the renderer can mount these values at markers (below).
```

`fallback()` returns the original `jsx(...)` tree, hoisted into a module-level
function that receives the evaluated hole values. Its own content is literals,
so evaluating it later observes nothing. Hoisted templates are inserted before
the first non-import statement, so a region mounted during module evaluation
finds them initialized.

## Dynamic children (holes)

A child expression that is not a literal, an array or a `jsx(...)` call (for
example `{name()}`, `{props.title}`, `{item}`, `{() => count()}`) becomes a
**hole**:

```js
// <div class="greet">hello {name()}<b>!</b></div>
const _tpl = _template('<div class="greet">hello <!----><b>!</b></div>');
function _create(d, hole, h) {
  if (!_acceptsHoles(h)) return null;   // decided before any node exists
  const r = _tpl(d);
  if (r === null) return null;
  const m0 = r.childNodes[1];
  hole(r, m0, h[0], false);             // the renderer mounts the value
  return r;
}
function App() {
  return _compiled(_create, _fallback, [name()]);
}
```

- **Timing.** The expression stays where the region is evaluated, in the same
  scope and the same order (document order is evaluation order for nested
  `jsx()` arguments). The fallback receives the value instead of
  re-evaluating it.
- **The renderer owns change.** `mountHole` is reflex-dom's
  `mountCompiledHole`: text through the array or `textContent` rule
  (`scalar`), empty values as nothing, accessors through the element text
  binding (`mountElementChildAccessor`, now with an insertion point), then the
  marker is removed. The compiler does not touch reactivity.
- **Exactness.** A hole is mounted after the region's later static siblings
  already exist, which differs from the element path's sequential build only
  if user code could look at the region meanwhile. Text and empty values run
  no code. An accessor's `read()` holds no reference into the region, and
  structural content mounts into a fragment first (as in the runtime). So
  `acceptsHoles` admits exactly text, empty values and accessors. An element,
  component or array value runs user code while the region is half built, so
  `create` declines before building and `fallback()` mounts it.
- **One hole per region** (`MAX_HOLES`). With two, an accessor whose first
  value is structural could expose a ref that the second accessor's `read()`
  uses to observe the half-built region. Regions with more holes stay on the
  runtime, and their static islands (children without holes) still compile.
- Props are never holes; a dynamic prop keeps the element on the runtime.

**Trusted Types / CSP.** The template is parsed in the mount document's own
realm. Under `require-trusted-types-for 'script'` the parse is refused (a
reported violation), `template()` returns `null` and the region mounts through
the runtime. The policy is never bypassed. `strategy: "native"` needs no HTML
parsing at all.

## Correctness gate

`pnpm test` (jsdom), `pnpm test:browser` (Chromium, as in CI) and
`pnpm test:browser:matrix` (Chromium, Firefox and WebKit; install the last two
with `playwright install firefox webkit`).

- `test/transform.test.ts`: binding resolution, evaluation timing, every
  escape rule (exports, direct calls, re-exports, escaping `<App/>`,
  reassignment, recursion, foreign `For`), every prop rule, text topology,
  parser demotion, strategy selection, off switches, diagnostics.
- `test/semantics.conformance.*`: the prop tables against the real runtime,
  per engine (above). A mutation check confirmed it fails in all four
  environments if `type` is put back.
- `test/differential/`: 13 fixtures compiled by the real JSX pipeline
  (esbuild) into `baseline`, `native`, `template` and `auto`, mounted through
  their own `render` entry point in independent containers, in the main
  document and in a detached document (jsdom) or an iframe document (browsers).
  The test compares DOM topology, namespaces, attributes, exact Text
  boundaries, reflected properties, `ownerDocument`, `innerHTML`, and the
  **MutationObserver records** of mount and dispose, as seen by one observer
  installed on the container before mount. The records must be non-empty.
  The plan's negative corpus must compile nothing. `holes.tsx` covers every
  kind of hole value, including those that must decline at runtime.
- `test/fuzz/`: fast-check generates lowered `jsx(...)` trees with hostile tags,
  every prop form, parser-hostile text and holes of every value kind, and
  compares the same observations, mutation records included. 300 runs in
  jsdom (`REFLEX_FUZZ_RUNS`), 150 per browser; it also asserts that regions
  with holes were compiled. At 5000 runs it found the two prop divergences
  fixed above; 40,000 further runs (15,000 with holes) found nothing.
- `test/holes.reactive.*`: one reactive hole between static siblings driven
  through text, number, empty, structural and back. It compares the DOM,
  per-update MutationObserver records and Text node identity with the baseline,
  including a structural first value.
- `test/bridge.test.ts`: SSR and hydration through `fallback()` (server nodes
  adopted), XML documents, parse-once templates, fresh nodes per mount, a
  refused template parse.
- `test/security.browser.test.ts` (Chromium): in a Trusted Types iframe,
  template regions fall back with identical DOM and a reported violation, and
  native regions trigger no violation.

**MutationObserver result:** across all fixtures, variants, documents and
generated trees, in jsdom, Chromium, Firefox and WebKit, the records are
identical to the baseline's. A region is built detached and inserted once,
exactly like the runtime's element.

## Benchmarks

`pnpm bench` (`-- --browsers=chromium --quick` for a short, non-comparable
run). Each instance is one row of reflex-dom's `For` whose callback returns
the scenario tree: the provable way to mount many instances. Pages are bundled
from source with production flags, and every scenario runs in a fresh page.

The corpus (scenarios, `page.ts`, `run.ts`) and the full-run parameters are
pinned by hash in `bench/corpus.lock.json`. A changed corpus aborts the run
unless `--refreeze` accepts it. `bench/results/latest.{md,json}` record the
commit, a dirty flag and the corpus hash.

Results: commit `feaf054`, clean, corpus `d66481ec83f3` (adds `row`: 10 static
nodes and one reactive text, the `For` item accessor), Windows 10, headless
Playwright builds of Chromium 151, Firefox 153 and WebKit 26.5. Ratios are
variant ÷ baseline reflex-dom, median of 11 samples; lower is faster.

| | tiny (2 nodes) | profile (5) | **row (10 + hole)** | card (18) | article (40) |
|---|---:|---:|---:|---:|---:|
| **Warm mount, 1000 rows: native** | | | | | |
| Chromium | 0.94 | 0.80 | 0.92 | 0.86 | 0.70 |
| Firefox | 1.00 | 1.14 | 1.06 | 0.94 | 1.07 |
| WebKit | 1.00 | 0.92 | 0.90 | 0.82 | 0.83 |
| **Warm mount, 1000 rows: template** | | | | | |
| Chromium | 0.87 | 0.59 | 0.73 | 0.53 | 0.47 |
| Firefox | 0.71 | 0.64 | 0.69 | 0.47 | 0.49 |
| WebKit | 0.80 | 0.58 | 0.67 | 0.40 | 0.31 |
| **Cold first mount: template** (includes the parse) | | | | | |
| Chromium | 1.87 | 1.65 | 1.65 | 1.51 | 1.26 |
| Firefox | 1.14 | 1.00 | 1.00 | 0.68 | 0.59 |
| WebKit | 1.33 | 1.33 | 1.50 | 1.29 | 1.00 |
| **Mounts until template beats native** | | | | | |
| Chromium | ~101 | ~10 | ~7 | ~4 | ~3 |
| Firefox | 1 | 1 | 1 | 1 | 1 |
| WebKit | ~15 | ~5 | ~3 | ~3 | 1 |

- **Templates still pay with a dynamic child.** `row` mounts 1.4–1.5× faster
  as a template in every engine (Chromium 5.30 → 3.85 µs, Firefox 12.0 →
  8.25 µs, WebKit 9.75 → 6.50 µs per row). The ratio is smaller than for
  static trees of the same size because every variant pays the same reactive
  binding per row; the static structure is what the template removes.
- **Template is the strategy that pays**: 1.6–3.2× faster than the baseline
  for static trees of 5+ nodes. Native only removes reflex-dom's per-prop and
  per-child dispatch: up to 30% in Chromium and WebKit, parity in Firefox,
  where the DOM calls dominate. Every row also pays `For`'s per-row
  ownership, so these ratios are lower than the first, region-only
  measurement (0.22–0.46 for template at 18+ nodes, superseded methodology).
- **Retained JS heap** while mounted (Chromium, per row): baseline 245 / 486 /
  1753 / 774 / 905 bytes, native 222 / 254 / 1232 / 382 / 540, template 222 /
  222 / 1199 / 222 / 199 (tiny, profile, row, card, article). A cloned template
  creates a JS wrapper for its root only. This covers the JS heap, not DOM or
  native memory. These numbers rose for every variant with the merged
  `For`/text-binding commit (`aaed287`; card baseline was 301 bytes before).
- **Retention after dispose, a runtime finding.** In Chromium, after forced
  GC, every mount/dispose cycle of 10,000 `row` rows leaves about 11 MB
  behind, roughly 1.1 KB per row, **in all variants, baseline included**, and
  the growth is linear over 30 cycles. It reproduces on the merge commit before
  any hole code (335 MB vs 343 MB after 30 cycles). Static `card` rows grew
  from about 2.2 to 3.3 MB per cycle with the same commit. Plain DOM code shows
  about 16 bytes per wrapped element (`bench/memory-probe.ts`), two orders of
  magnitude less, so this looks like reflex-dom retaining per-row binding or
  ownership state. It made Firefox's tab crash when all scenarios shared one
  page, hence one page per scenario.
- **Size.** Each compiled region keeps its `jsx(...)` source as the fallback.
  Gzipped app bundles grow by +93 / +123 / +269 / +286 / +410 bytes (native)
  and +237 / +265 / +400 / +382 / +423 bytes (template, helper included).
- **Caveats.** Firefox and WebKit expose a 1 ms timer here. Cold samples batch
  300 mounts, so they move in ~3.3 µs steps. "Cold" is the first mount of a
  freshly evaluated region in a warm runtime: region preparation, not page
  start-up.

### `AUTO_TEMPLATE_MIN_NODES = 8` is a steady-state heuristic

Region size predicts how much a clone saves per mount, not how often the
region mounts. For a region of n nodes mounted m times:

```
C_template(n, m) = P(n) + m·K(n)     parse once, clone per mount
C_native(n, m)   = m·N(n)
template wins when m > P(n) / (N(n) − K(n))
```

The data give pieces of that function. At 10+ nodes m ≤ 7 in every engine (≤ 4
from 18 nodes). At 5 nodes Chromium needs ~10 mounts, and at 2 nodes ~101. A 30-node region mounted
once can lose with a template; an 8-node row mounted 10,000 times wins
decisively. The number 8 is not proven; it only orders the measured cases.

## Ideas (not implemented)

- **Multiplicity from `For`.** A region inside a consumed `For` callback is
  meant to mount many times, so it is the natural template candidate
  regardless of size. This replaces the size heuristic with information the
  program states.
- **Delayed template specialization.** Mount natively first and switch to a
  template after a few mounts: an inline cache keyed on mount frequency
  instead of object shape. It needs both builders, a counter and a
  per-document cache, so measure real multiplicity distributions first.
- **Recovering coverage provably.** Options: a whole-program view in a bundler
  plugin (all importers of an exported component), or a descriptor that stays
  observable (`kind`/`tag`/lazy `props`) and drops to the runtime once
  inspected. With holes in place, this is now the main lever on real code:
  54 of the mini-app's 100 regions stop at the consumer proof.
- **Client-only builds** that erase the fallback (no SSR or hydration), or
  `browser-compiled` / `universal-compiled` conditional exports.

## Status against the plan's acceptance checklist

- [x] Ordinary JSX still lowers to the same `jsx(...)` calls. The compiler is
  an opt-in pass after that, and reflex-dom's public API is unchanged.
- [x] Static trees compile through two independent strategies (native and
  template).
- [x] Every supported transformation passes differential tests in Chromium,
  Firefox and WebKit, MutationObserver records included.
- [x] Unsupported cases stay on the runtime. The negative corpus compiles
  nothing, and every fallback carries a reason.
- [x] No user code moves in time, refs and events are rejected, descriptors
  provably reach only the renderer, and DOM observations (tree and mutation
  records) are compared. No naming conventions are assumed.
- [x] Benchmarks are reproducible with `pnpm bench` on a frozen corpus, and
  sizes are measured.
- [x] Everything switches off without touching application code
  (`enabled: false`, or `strategy` per build).

## Not done yet

- More than one hole per region (needs a proof that no accessor can expose
  the half-built region to another), dynamic props, and control-flow holes
  (`Show`/`For` as children).
- The integration-level keyed 1k/10k benchmark.
- Lifecycle, event and ref rows of the differential matrix: those props are
  rejected, so for now the tests assert that they stay on the runtime.
