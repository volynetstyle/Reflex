# Compiled store transform contract

## Recognition and declarations

Recognize createStore imports from @volynets/reflex-store, /advanced, /store and
/compiled-store, including aliases. Match binding identity, not text alone.
The compiler API may recognize unresolved bare createStore calls; the Vite plugin
requires a matching import unless compileBareCreateStore is enabled.

Lexical module/function/block declarations are supported. Each execution of a
local declaration allocates independent store resources. Inline return
createStore(...) and loop-header declarations remain diagnosed.

## Shape and boundaries

Accept unique static data keys, root method declarations and root getter
declarations. Literal data objects become branches. Imported leaf(value) and
opaque(value) calls define one replaceable location. Preserve opaque marking.
Optional options require a static name string.

Data initializers execute once in source order for each declaration execution.
Data leaf reads are direct address calls. Producers materialize on tracked reads.

## Methods and getters

Root methods become bound ctx.action callbacks. Rewrite their store this
references to the declaration binding, preserving lexical-arrow this and leaving
nested ordinary function/class receivers intact. Lower static leaf reads/writes
inside the callbacks as usual. Multi-write methods close one outer host/runtime
batch.

Root getters become owned createDisposableComputed accessors. Their this
references lower to store locations. Clean reads cache; writes invalidate and
pull reads compute current data. Getters cannot write store state or suspend.
Async/generator methods, setters and nested methods/getters are unsupported.

## Writes and JavaScript order

Support =, +=, -=, prefix/postfix ++ and -- on declared data leaves.
Evaluate the previous value before a compound RHS, evaluate the RHS once and
then commit the result. Update operators preserve JavaScript ToNumeric,
including strings, undefined, NaN, signed zero and BigInt. Exceptions before
commit preserve the previous value; action exceptions close batches.

## Facade, ownership and extraction

The generated facade contains data accessors, getter accessors, bound actions,
dispose and Symbol.dispose. The model owns cells and computed getter resources.
Static hidden control callbacks extract only data fields and restore values to
known cells. Returning a facade (also within a factory return object) is supported.

snapshot/hydrate imports are recognized intrinsic data boundaries. own(ctx, state)
and getStoreName(state) are recognized ownership/diagnostic boundaries. Runtime
snapshot invokes the generated extraction untracked, preserving structural graph
semantics. Hydration validates the exact compiled branch/leaf schema before one
batched write. Empty branches are represented explicitly.

eraseFacade is opt-in. Omit a facade only if every use can lower to declared data
cells and no method/getter/escape/lifecycle/data boundary needs the object.

## Runtime and tooling

Default imports use @volynets/reflex-store/runtime and /runtime/internal.
All published entrypoints share the embedded host/kernel. The Vite plugin aliases
legacy Reflex and runtime imports to that same host/kernel.

Custom data-only lowering targets may configure model/signal names and generated
identifiers. Getter/method lowering requires the default bundled createModel host.
The compiler includes portable SWC WASM and validates its normalized function AST
before printing. Names are store metadata and never modify kernel hot paths.

## Diagnostics

Diagnose unsupported shapes and mutations before erasure. Collect mode returns
the original code when diagnostics exist. No partial transform is published for
an unsupported source module.
