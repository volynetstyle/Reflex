import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { rollup } from "rollup";
import swc from "@rollup/plugin-swc";
import terser from "@rollup/plugin-terser";
import replace from "@rollup/plugin-replace";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const repository = path.resolve(root, "../..");
const output = path.join(here, "results");
const baselineRef = process.env.BASELINE_REF ?? "HEAD";
const sizes = [0, 1, 16, 31, 32, 33, 64, 256, 1024, 4096];
const workloads = ["stable", "alternating", "replacement", "reorder"];
const target = "src/kernel/shape/graph/reuseEdge.ts";
const baseline = execFileSync(
  "git",
  ["show", `${baselineRef}:packages/reflex-runtime/${target}`],
  { cwd: repository, encoding: "utf8" },
);
const modified = fs.readFileSync(path.join(root, target), "utf8");
if (baseline === modified)
  throw new Error("Baseline and candidate are identical");
fs.mkdirSync(output, { recursive: true });

// Instrument only the structural bundle. No getters, proxies, degree scans,
// graph snapshots or runtime profiler. Every event is a plain increment.
function instrument(code, id) {
  if (!id.replaceAll("\\", "/").includes("/src/kernel/")) return code;
  const sf = ts.createSourceFile(
    id,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const f = ts.factory;
  const inc = (name) =>
    f.createPostfixIncrement(
      f.createPropertyAccessExpression(
        f.createIdentifier("__suffixCounters"),
        name,
      ),
    );
  const count = (name, expression) =>
    f.createParenthesizedExpression(
      f.createBinaryExpression(
        inc(name),
        f.createToken(ts.SyntaxKind.CommaToken),
        expression,
      ),
    );
  const pointerNames = new Set(["nextIn", "prevIn", "nextOut", "prevOut"]);
  const moveNames = new Set([
    "moveLastIncomingEdgeAfterCursorUnchecked",
    "moveLastIncomingEdgeToFrontUnchecked",
    "moveTrackedIncomingEdgeAfterCursorUnchecked",
  ]);
  const transformed = ts.transform(sf, [
    (context) => {
      const visit = (node) => {
        // Count each edge allocation (all tracking allocators use an object with from/to).
        if (
          ts.isObjectLiteralExpression(node) &&
          ["from", "to", "nextIn", "nextOut"].every((name) =>
            node.properties.some((p) => p.name?.getText(sf) === name),
          )
        ) {
          return count(
            "edgeAllocations",
            count("edgeLinks", ts.visitEachChild(node, visit, context)),
          );
        }
        if (
          ts.isPropertyAccessExpression(node) &&
          pointerNames.has(node.name.text)
        ) {
          const parent = node.parent;
          const isWrite =
            ts.isBinaryExpression(parent) &&
            parent.left === node &&
            parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
          if (!isWrite)
            return count(
              "linksTraversed",
              ts.visitEachChild(node, visit, context),
            );
        }
        // Sweep destructuring reads both outgoing neighbors without property-access AST nodes.
        if (
          ts.isVariableDeclaration(node) &&
          ts.isObjectBindingPattern(node.name) &&
          node.initializer
        ) {
          const reads = node.name.elements.filter((e) =>
            pointerNames.has((e.propertyName ?? e.name).getText(sf)),
          ).length;
          let init = ts.visitNode(node.initializer, visit);
          for (let i = 0; i < reads; i++) init = count("linksTraversed", init);
          return f.updateVariableDeclaration(
            node,
            node.name,
            node.exclamationToken,
            node.type,
            init,
          );
        }
        // Every full unlink clears nextOut exactly once. Link construction is counted above.
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) &&
          node.left.name.text === "nextOut" &&
          node.right.kind === ts.SyntaxKind.NullKeyword
        ) {
          return count("edgeUnlinks", ts.visitEachChild(node, visit, context));
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(sf) === "profileRuntimeCounter" &&
          node.arguments[0]?.text === "trackingEdgeMoved"
        )
          return inc("edgeMoves");
        if (
          ts.isFunctionDeclaration(node) &&
          moveNames.has(node.name?.text) &&
          node.body
        ) {
          const updated = ts.visitEachChild(node, visit, context);
          return f.updateFunctionDeclaration(
            updated,
            updated.modifiers,
            updated.asteriskToken,
            updated.name,
            updated.typeParameters,
            updated.parameters,
            updated.type,
            f.updateBlock(updated.body, [
              f.createExpressionStatement(inc("edgeMoves")),
              ...updated.body.statements,
            ]),
          );
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit);
    },
  ]);
  const result =
    "const __suffixCounters = globalThis.__suffixCounters;\n" +
    ts.createPrinter().printFile(transformed.transformed[0]);
  transformed.dispose();
  return result;
}

// Reuse the repository's production minifier policy, including its verified no-op list.
function productionMinifier() {
  function evaluate(file, require) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function("require", "exports", code)(require, exports);
    return exports;
  }
  const optimization = evaluate(
    path.join(root, "rollup/optimization.ts"),
    () => {
      throw new Error("Unexpected optimization import");
    },
  );
  const policy = evaluate(
    path.join(root, "rollup/plugins/terser.ts"),
    (name) =>
      name === "@rollup/plugin-terser"
        ? { default: terser }
        : name === "../optimization.ts"
          ? optimization
          : name === "../targets.ts"
            ? { isProd: () => true }
            : (() => {
                throw new Error(name);
              })(),
  );
  return policy.createTerserPlugin({ format: "esm" });
}
for (const variant of ["before", "after"])
  for (const structural of [false, true]) {
    const bundle = await rollup({
      input: path.join(root, "src/protocol/index.ts"),
      onwarn(warning, warn) {
        if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
      },
      plugins: [
        {
          name: "isolated-suffix-experiment",
          resolveId(source, importer) {
            let resolved;
            if (source.startsWith("@runtime/"))
              resolved = path.join(root, "src", source.slice(9));
            else if (source.startsWith(".") && importer)
              resolved = path.resolve(path.dirname(importer), source);
            else if (path.isAbsolute(source)) resolved = source;
            if (!resolved) return null;
            for (const candidate of [
              resolved,
              resolved + ".ts",
              path.join(resolved, "index.ts"),
            ])
              if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
                return candidate;
            return null;
          },
          load(id) {
            if (!id.endsWith(".ts")) return null;
            let code =
              path.resolve(id) === path.join(root, target) &&
              variant === "before"
                ? baseline
                : fs.readFileSync(id, "utf8");
            return structural ? instrument(code, id) : code;
          },
        },
        replace({
          preventAssignment: true,
          values: {
            __DEV__: "false",
            __PROFILE__: "false",
            __TRACKING_ONE_HOP__: "true",
            __TRACKING_TWO_HOP__: "true",
            __TRACKING_LAST_EDGE__: "true",
          },
        }),
        swc({
          swc: {
            jsc: { parser: { syntax: "typescript" }, target: "es2022" },
            minify: false,
          },
        }),
        productionMinifier(),
      ],
    });
    const file = path.join(
      output,
      `${variant}-${structural ? "structural" : "timing"}.mjs`,
    );
    await bundle.write({ file, format: "es" });
    await bundle.close();
    if (
      !structural &&
      /__suffixCounters|profileRuntimeCounter\(/.test(
        fs.readFileSync(file, "utf8"),
      )
    )
      throw new Error("Timing bundle contains counters");
  }
const runtimePatch = execFileSync(
  "git",
  [
    "diff",
    baselineRef,
    "--",
    "packages/reflex-runtime/src/kernel/shape/graph/reuseEdge.ts",
  ],
  { cwd: repository },
);
fs.writeFileSync(path.join(output, "runtime.patch"), runtimePatch);
const runtimePatchSha256 = createHash("sha256")
  .update(runtimePatch)
  .digest("hex");
const bundleSha256 = Object.fromEntries(
  fs
    .readdirSync(output)
    .filter((name) => name.endsWith(".mjs"))
    .sort()
    .map((name) => [
      name,
      createHash("sha256")
        .update(fs.readFileSync(path.join(output, name)))
        .digest("hex"),
    ]),
);
const rows = [];
for (const workload of workloads)
  for (const D of sizes) {
    const row = JSON.parse(
      execFileSync(
        process.execPath,
        ["--expose-gc", path.join(here, "worker.mjs"), workload, String(D)],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      ),
    );
    rows.push(row);
    console.log(
      `${workload} D=${D}: mutation ${row.before.structural.physicalMutations} -> ${row.after.structural.physicalMutations}; time ratio ${row.timeRatio.toFixed(3)}`,
    );
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify(
        {
          metadata: {
            runtimePatchSha256,
            bundleSha256,
            baselineRef,
            baselineCommit: execFileSync("git", ["rev-parse", baselineRef], {
              cwd: repository,
              encoding: "utf8",
            }).trim(),
            node: process.version,
            cpu: os.cpus()[0].model,
            platform: process.platform,
            date: new Date().toISOString(),
            sizes,
            workloads,
            samples: 15,
            batchTargetMs: 20,
            structuralPasses: 16,
            note: "Each cell runs in a fresh process; paired AB/BA batch timing; p99 is batch-normalized latency, not individual operation latency.",
          },
          rows,
        },
        null,
        2,
      ) + "\n",
    );
  }
