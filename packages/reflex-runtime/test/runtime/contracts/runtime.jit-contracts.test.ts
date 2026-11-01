import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { RuleContext } from "@tsslint/config";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { jitContracts } from "../../../config/tsslint/jit-contracts";

/** A real TypeScript program and checker, with no unrelated ambient types. */
function lint(source: string, overrides: ts.CompilerOptions = {}): string[] {
  const fileName = "/jit-contract-fixture.ts";
  const options: ts.CompilerOptions = {
    strict: true,
    noLib: true,
    ...overrides,
  };
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => (name === fileName ? file : undefined);
  host.fileExists = (name) => name === fileName;
  host.readFile = (name) => (name === fileName ? source : undefined);
  const program = ts.createProgram([fileName], options, host);
  const messages: string[] = [];
  const report: RuleContext["report"] = (message) => {
    messages.push(message);
    return {
      asError() {
        return this;
      },
    } as ReturnType<RuleContext["report"]>;
  };
  jitContracts({ typescript: ts, program, file, report });
  return messages;
}

const counter = (source: string, writes: string) => `
  declare function read(n: number): void;
  function run(input: number) {
    ${source}
    // @jit int32-provenance(base)
    let top = base;
    ${writes}
    return top;
  }
`;

describe("JIT source contracts", () => {
  it("accepts signed Int32 sources, updates and ordinary reads", () => {
    for (const source of [
      "const base = input | 0;",
      "const base = -2147483648;",
      "const base = 2147483647;",
    ]) {
      expect(
        lint(counter(source, "top++; ++top; top--; --top; read(top);")),
      ).toEqual([]);
    }
  });

  it.each([
    "top = 1;",
    "top += 1;",
    "top ||= 1;",
    "[top] = [1];",
    "({value: top} = {value: 1});",
    "({top} = {top: 1});",
    "({top = 1} = {});",
    "for (top of [1]) {}",
    "for ([top] of [[1]]) {}",
    "for (top in {a: 1}) {}",
    "function nested() { top = 2; }",
  ])("rejects a write other than increment or decrement: %s", (write) => {
    expect(lint(counter("const base = input | 0;", write))).toContain(
      "int32-provenance permits only ++ or -- writes to the tracked binding.",
    );
  });

  it("uses symbols so shadowed names do not affect the tracked binding", () => {
    expect(
      lint(
        counter("const base = input | 0;", "{ let top = 0; top = 2; } top++;"),
      ),
    ).toEqual([]);
  });

  it("checks the actual source binding when its name is shadowed", () => {
    expect(
      lint(`
        const base = 0;
        function run(input: number) {
          const base = input;
          // @jit int32-provenance(base)
          let top = base;
          top++;
        }
      `),
    ).toContain(
      "int32-provenance requires a function-local binding and a const source initialized by number | 0 or an Int32 literal.",
    );
  });

  it("rejects a nonlocal tracked binding", () => {
    expect(
      lint(`
        const base = 0;
        // @jit int32-provenance(base)
        let top = base;
        top++;
      `),
    ).toContain(
      "int32-provenance requires a function-local binding and a const source initialized by number | 0 or an Int32 literal.",
    );
  });

  it.each([
    "const base = input;",
    "let base = input | 0;",
    "const base = 2147483648;",
    "const base = -2147483649;",
    "const base = (input as any) | 0;",
    "const base = input >>> 0;",
  ])("rejects an unproven source: %s", (source) => {
    expect(lint(counter(source, "top++;"))).toContain(
      "int32-provenance requires a function-local binding and a const source initialized by number | 0 or an Int32 literal.",
    );
  });

  it("rejects a mismatched source and direct eval", () => {
    expect(
      lint(
        counter("const base = input | 0; const other = input | 0;", "").replace(
          "let top = base;",
          "let top = other;",
        ),
      ),
    ).toContain(
      "int32-provenance requires initialization from the named source binding.",
    );
    expect(
      lint(counter("const base = input | 0;", "eval('top = 2');")),
    ).toContain(
      "int32-provenance does not allow direct eval in the enclosing function.",
    );
    expect(
      lint(counter("const base = input | 0;", "(eval as any)('top = 2');")),
    ).toContain(
      "int32-provenance does not allow direct eval in the enclosing function.",
    );
    expect(
      lint(counter("const base = input | 0;", "eval!('top = 2');")),
    ).toContain(
      "int32-provenance does not allow direct eval in the enclosing function.",
    );
    expect(
      lint(counter("const base = input | 0;", "with ({}) { top++; }")),
    ).toContain(
      "int32-provenance does not allow with in the enclosing function.",
    );
  });

  it("accepts only explicit primitive-boolean call checks", () => {
    expect(
      lint(`
      declare function check(): boolean;
      declare function literal(): true;
      // @jit canonical-boolean
      if (check() === true) {}
      // @jit canonical-boolean
      while (literal() === true) { break; }
      // @jit canonical-boolean
      if ((check()) === true) {}
    `),
    ).toEqual([]);
  });

  it.each([
    ["boolean | undefined", "check() === true"],
    ["any", "check() === true"],
    ["unknown", "check() === true"],
    ["Boolean", "check() === true"],
    ["boolean", "check() == true"],
    ["boolean", "true === check()"],
    ["boolean", "check()"],
  ])("rejects %s with condition %s", (result, condition) => {
    expect(
      lint(`
      interface Boolean { valueOf(): boolean }
      declare function check(): ${result};
      // @jit canonical-boolean
      if (${condition}) {}
    `),
    ).toContain(
      "canonical-boolean requires a primitive boolean call compared with === true.",
    );
  });

  it("rejects unresolved generic boolean types", () => {
    expect(
      lint(`
      function run<T extends boolean>(check: () => T) {
        // @jit canonical-boolean
        if (check() === true) {}
      }
    `),
    ).toContain(
      "canonical-boolean requires a primitive boolean call compared with === true.",
    );
  });

  it("requires strict null checking before accepting a boolean result", () => {
    expect(
      lint(
        `declare function check(): boolean | undefined;
         // @jit canonical-boolean
         if (check() === true) {}`,
        { strictNullChecks: false },
      ),
    ).toContain("canonical-boolean requires strictNullChecks.");
  });

  it("reports unknown, malformed and misplaced directives", () => {
    expect(lint("// @jit no-allocation\nfunction run() {}")).toContain(
      "Unknown @jit contract: no-allocation.",
    );
    expect(lint("// @jit int32-provenance(base)\nconst x = 0;")).toContain(
      "int32-provenance requires one local let declaration.",
    );
    expect(lint("// @jit canonical-boolean\nconst x = true;")).toContain(
      "canonical-boolean requires an if or while condition.",
    );
    expect(
      lint("const x = 0; // @jit canonical-boolean\nif (true) {}"),
    ).toContain(
      "@jit must be a standalone line comment immediately before a statement.",
    );
  });

  it("does not treat directive-like strings as comments", () => {
    expect(lint('const x = "// @jit no-allocation";')).toEqual([]);
    expect(lint("const x = `text\n// @jit no-allocation\ntext`;")).toEqual([]);
  });

  it("runs the type-aware rule through the configured TSSLint CLI", () => {
    const packageRoot = path.resolve(import.meta.dirname, "../../..");
    const cacheRoot = path.join(packageRoot, ".cache");
    mkdirSync(cacheRoot, { recursive: true });
    const fixtureRoot = mkdtempSync(path.join(cacheRoot, "jit-contracts-"));
    const relative = path.relative(
      realpathSync(cacheRoot),
      realpathSync(fixtureRoot),
    );
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("JIT contract fixture escaped the workspace cache");
    }
    try {
      writeFileSync(
        path.join(fixtureRoot, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { strict: true, noEmit: true },
          include: ["fixture.ts"],
        }),
      );
      const sourceFile = path.join(fixtureRoot, "fixture.ts");
      const cli = createRequire(import.meta.url).resolve(
        "@tsslint/cli/bin/tsslint.js",
      );
      const run = () =>
        spawnSync(
          process.execPath,
          [
            "--experimental-strip-types",
            cli,
            "--project",
            path.join(fixtureRoot, "tsconfig.json"),
            "--force",
            "--list-rules",
          ],
          { cwd: packageRoot, encoding: "utf8", timeout: 30_000 },
        );

      writeFileSync(
        sourceFile,
        counter("const base = input | 0;", "top += 1;"),
      );
      const invalid = run();
      expect(invalid.status, invalid.stderr).toBe(1);
      expect(invalid.stdout).toContain(
        "int32-provenance permits only ++ or --",
      );
      expect(invalid.stdout).toContain("type-aware");

      writeFileSync(sourceFile, counter("const base = input | 0;", "top++;"));
      const valid = run();
      expect(valid.status, valid.stderr).toBe(0);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it("updates contract diagnostics through the configured TypeScript server", async () => {
    const packageRoot = path.resolve(import.meta.dirname, "../../..");
    const file = path.join(
      packageRoot,
      "src/kernel/stages/propagation/push_iterator.ts",
    );
    const source = readFileSync(file, "utf8");
    expect(source).toContain("// @jit int32-provenance(base)");
    const edited = source.replace(
      "let top = base;",
      "let top = base;\n  top = 42;",
    );
    expect(edited).not.toBe(source);
    const insertedLine = edited
      .slice(0, edited.indexOf("  top = 42;"))
      .split("\n").length;
    const serverPath = createRequire(import.meta.url).resolve(
      "typescript/lib/tsserver.js",
    );

    await new Promise<void>((resolve, reject) => {
      const server = spawn(
        process.execPath,
        ["--experimental-strip-types", serverPath],
        {
          cwd: packageRoot,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      server.stderr.resume();
      let pending = Buffer.alloc(0);
      let sequence = 0;
      let changeSequence = 0;
      let finished = false;
      const send = (command: string, args: Record<string, unknown>) => {
        const requestSequence = ++sequence;
        server.stdin.write(
          JSON.stringify({
            seq: requestSequence,
            type: "request",
            command,
            arguments: args,
          }) + "\n",
        );
        return requestSequence;
      };
      const finish = (failure?: Error) => {
        if (finished) return;
        finished = true;
        clearInterval(poll);
        clearTimeout(deadline);
        server.kill();
        if (failure) reject(failure);
        else resolve();
      };
      server.on("error", (failure) => finish(failure));
      server.on("exit", (code) => {
        if (!finished)
          finish(new Error(`tsserver exited before a diagnostic: ${code}`));
      });
      server.stdout.on("data", (chunk: Buffer) => {
        pending = Buffer.concat([pending, chunk]);
        for (;;) {
          const boundary = pending.indexOf("\r\n\r\n");
          if (boundary < 0) return;
          const header = pending.subarray(0, boundary).toString("utf8");
          const length = /Content-Length: (\d+)/i.exec(header);
          if (length === null) {
            pending = pending.subarray(boundary + 4);
            continue;
          }
          const end = boundary + 4 + Number(length[1]);
          if (pending.length < end) return;
          try {
            const frame = JSON.parse(
              pending.subarray(boundary + 4, end).toString("utf8"),
            );
            pending = pending.subarray(end);
            if (frame.command === "semanticDiagnosticsSync" && frame.success) {
              const violated = JSON.stringify(frame.body).includes(
                "int32-provenance permits only",
              );
              if (changeSequence === 0 && violated) {
                changeSequence = send("change", {
                  file,
                  line: insertedLine,
                  offset: 1,
                  endLine: insertedLine + 1,
                  endOffset: 1,
                  insertString: "",
                });
              } else if (
                changeSequence !== 0 &&
                frame.request_seq > changeSequence &&
                !violated
              ) {
                finish();
                return;
              }
            }
          } catch (failure) {
            finish(
              failure instanceof Error ? failure : new Error(String(failure)),
            );
            return;
          }
        }
      });
      send("open", { file, fileContent: edited });
      const poll = setInterval(() => {
        send("semanticDiagnosticsSync", { file, includeLinePosition: true });
      }, 1_000);
      const deadline = setTimeout(
        () =>
          finish(new Error("tsserver did not update the TSSLint diagnostic")),
        30_000,
      );
    });
  }, 45_000);
});
