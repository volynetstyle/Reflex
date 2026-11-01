# JIT source contracts

The prototype turns selected `// JIT:` assumptions into checks over the
TypeScript program. It has two separate levels:

1. `tsslint` checks the annotated source-level premises using TypeScript's
   symbols and type checker.
2. The optional V8 shape probe records optimized code and deoptimizations for
   specific workloads. Performance conclusions still use the existing
   [performance rules](./PERFORMANCE_RULES.md) and paired benchmark protocol.

The source checks do not prove V8's representation, inlining, lack of deopts,
or runtime values when code violates its TypeScript types. There is no claim
that incrementing an Int32 remains in range: JavaScript numbers can exceed it.

## Using a contract

Place one standalone directive immediately before its statement, with only
whitespace in between. Unknown contracts, malformed directives and unsupported
placements are errors. Checks are opt-in: code without a directive is not
checked, and removing a directive removes its check. The current annotated sites
are in `push_iterator.ts` and `pull_iterator.ts`.

```ts
const base = high | 0;
// @jit int32-provenance(base)
let top = base;

top++;
--top;
readStackIndex(top); // reading or passing a number is allowed

// @jit canonical-boolean
if (advance(node, edge) === true) {
  // ...
}
```

`int32-provenance(base)` requires exactly one function-local `let` initialized
from the named binding. That binding must be a `const` whose initializer is
either an integer literal in the signed 32-bit range or a numeric expression
`| 0`. For the latter, the operand must have a direct TypeScript number-like
type; unions, type parameters and `any` are not accepted. The checker resolves
the two bindings by symbol, so shadowed variables are distinct. It permits
only prefix/postfix `++` and `--` writes to the
tracked binding, including in nested functions. Other writes, including
compound assignments, destructuring and `for-in`/`for-of` targets, are errors.
Direct `eval` and `with` in the enclosing function are rejected because they
prevent this local analysis from accounting for writes. Ordinary reads, array
indices and passing the numeric value to a function are allowed; JavaScript
passes a number by value, so that alone cannot assign to the local binding.

This proves the stated syntactic provenance and write policy for a local
binding. It does not prove a range after the first update, nor does it track
the binding's uses through calls, prove that it does not escape, or prove the
representation selected by an engine.

`canonical-boolean` applies to an `if` or `while` whose entire condition is
a call compared with `=== true`. Parentheses around the call are accepted.
It requires `strictNullChecks`, so nullable return types cannot collapse to
`boolean` before the rule examines them.
The TypeScript result type must consist only of primitive boolean literals or
`boolean`; `any`, `unknown`, `Boolean`, nullable unions and unresolved generic
types are rejected. This is a strict equality check on JavaScript primitives;
any V8 root-value comparison or lowering is an engine-specific observation.

There are intentionally no `monomorphic`, `stable-shape`, `no-allocation`, or
`no-escape` implementations yet. Using one as a directive fails rather than
silently presenting an unimplemented property as checked. New contracts need
an explicit proof boundary and positive and negative tests.

## Running and extending

From `packages/reflex-runtime`:

```sh
pnpm lint:tsslint       # full project, no diagnostic cache
pnpm lint               # ESLint and TSSLint; used by the runtime quality gate
pnpm typecheck:tsslint  # typecheck the config and rule
pnpm check:jit-shape    # optional V8 evidence for the current working tree
```

`tsconfig.json` registers `@tsslint/typescript-plugin` for the TypeScript
language service. Use the workspace TypeScript version in the editor; Node 24
is the repository's CI version. The CLI and editor read the same
`tsslint.config.ts` and rule in `config/tsslint/jit-contracts.ts`. Tests in
`test/runtime/contracts/runtime.jit-contracts.test.ts` exercise a real
TypeScript checker and the configured TSSLint CLI.

`check:jit-shape` builds a readable production-flag bundle and runs the
existing `perf/v8-shape/analyze.mjs` on the chain and fan-out workloads. It
requires a separately emitted optimized `pushIteratorCore` in both and a
separately emitted optimized `pull_iterator` in the chain, then reports code
size, checks and observed deoptimizations. A missing separate function means
this probe has no evidence; V8 may have inlined it. The JSON report defaults to
`.cache/jit-contracts/v8-shape.json`. Use `--node <path>` and `--out <path>`
after `pnpm check:jit-shape --` to select an engine and report location.

This is a diagnostic, not a speed gate or a proof of Int32 lowering. Inspect
the report and, when necessary, the engine's generated code and deopt traces
on the benchmark runner's Node version; compare timing and tail behavior using
the paired protocol before claiming a performance result.
