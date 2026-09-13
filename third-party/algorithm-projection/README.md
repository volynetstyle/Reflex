# `@volynets/algorithm-projection`

Static projection of a TypeScript function into a small, serializable Algorithm IR. The package combines TypeScript `Program`/`TypeChecker` with ESLint Code Path Analysis, then lifts syntax into observed loops, branches, reads, writes, calls, state transitions, linked traversals, and explicit stack candidates. It never instruments or modifies analyzed source.

```ts
import { analyzeFile, printProjection } from "@volynets/algorithm-projection";
const projection = analyzeFile("src/push.ts", "pushIteratorCore", {
  tsconfig: "tsconfig.json",
});
console.log(printProjection(projection));
```

Use `analyzeSource(code, functionName, options)` for editors and generated inputs. Prefer `analyzeFile` with the consumer's `tsconfig.json` when cross-file type resolution matters.

The output deliberately contains facts and conservative structural candidates only. It does not label a traversal as DFS or assign domain meaning to flags.

## CLI

```sh
algorithm-projection src/push.ts pushIteratorCore --project tsconfig.json
algorithm-projection src/push.ts pushIteratorCore --compact --output projection.json
algorithm-projection src/push.ts pushIteratorCore --project tsconfig.json --plan
```

The command writes JSON to stdout by default. Diagnostics go to stderr and failures return a non-zero exit code. Run `algorithm-projection --help` for all options. `--plan` emits stable observation points derived from function boundaries, CFG exits, loops, branch outcomes, state transitions, and stack operations.
