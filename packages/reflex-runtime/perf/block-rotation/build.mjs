import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { rollup } from "rollup";
import swc from "@rollup/plugin-swc";
import terser from "@rollup/plugin-terser";
import replace from "@rollup/plugin-replace";
import ts from "typescript";
export const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
export const output = path.join(here, "results");
const helper = "moveTrackedIncomingEdgeAfterCursorUnchecked";
const rotation = fs.readFileSync(
  path.join(here, "rotation-body.ts.txt"),
  "utf8",
);
const target = path.join(root, "src/kernel/shape/graph/edgeList.ts");
function overlay(code, id, variant) {
  if (id !== target || variant !== "rotate") return code;
  const sf = ts.createSourceFile(
    id,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const fn = sf.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === helper,
  );
  if (!fn?.body) throw new Error("Rotation target not found");
  return (
    code.slice(0, fn.body.getStart(sf) + 1) +
    "\n" +
    rotation +
    code.slice(fn.body.end - 1)
  );
}
function instrument(code, id, variant) {
  if (!id.replaceAll("\\", "/").includes("/src/kernel/")) return code;
  const sf = ts.createSourceFile(
      id,
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
    f = ts.factory;
  const inc = (n) =>
    f.createPostfixIncrement(
      f.createPropertyAccessExpression(f.createIdentifier("__cost"), n),
    );
  const count = (n, x) =>
    f.createParenthesizedExpression(
      f.createBinaryExpression(
        inc(n),
        f.createToken(ts.SyntaxKind.CommaToken),
        x,
      ),
    );
  const incoming = new Set(["prevIn", "nextIn", "firstIn", "lastIn", "tailIn"]),
    outgoing = new Set(["prevOut", "nextOut", "firstOut", "lastOut"]);
  const searchFunctions = new Set([
    "resolveCursorTrackedReadMiss",
    "resolveInitialTrackedReadMiss",
    "resolveTrackedReadSlow",
    "scanProducerInTrackedPrefix",
    "hasProducerEdgeInCurrentPassUnchecked",
    "hasProducerInCompletedPrefix",
    "hasProducerInTrackedPrefix",
    "reuseIncomingEdgeFromSuffixOrLink",
    "reconcileIncomingSuffix",
    "findOutgoingEdgeToConsumer",
  ]);
  const moves = new Set([
    helper,
    "moveLastIncomingEdgeAfterCursorUnchecked",
    "moveLastIncomingEdgeToFrontUnchecked",
  ]);
  const propertyReads = new Set([...incoming, ...outgoing, "from", "to"]);
  const result = ts.transform(sf, [
    (ctx) => {
      let functionName = "";
      const visit = (node) => {
        if (ts.isFunctionDeclaration(node)) {
          const prev = functionName;
          functionName = node.name?.text ?? "";
          let updated = ts.visitEachChild(node, visit, ctx);
          functionName = prev;
          if (moves.has(node.name?.text) && updated.body) {
            const name =
              node.name.text === helper && variant === "rotate" ? "B" : "M";
            updated = f.updateFunctionDeclaration(
              updated,
              updated.modifiers,
              updated.asteriskToken,
              updated.name,
              updated.typeParameters,
              updated.parameters,
              updated.type,
              f.updateBlock(updated.body, [
                f.createExpressionStatement(inc(name)),
                ...updated.body.statements,
              ]),
            );
          }
          return updated;
        }
        if (
          ts.isObjectLiteralExpression(node) &&
          ["from", "to", "nextIn", "nextOut"].every((n) =>
            node.properties.some((p) => p.name?.getText(sf) === n),
          )
        ) {
          let x = ts.visitEachChild(node, visit, ctx);
          for (const n of [
            "A",
            "L",
            "incomingPointerWrites",
            "incomingPointerWrites",
            "outgoingPointerWrites",
            "outgoingPointerWrites",
            "endpointPointerWrites",
            "endpointPointerWrites",
          ])
            x = count(n, x);
          return x;
        }
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left)
        ) {
          const prop = node.left.name.text;
          let x = ts.visitEachChild(node, visit, ctx);
          if (incoming.has(prop)) x = count("incomingPointerWrites", x);
          if (outgoing.has(prop)) x = count("outgoingPointerWrites", x);
          if (
            prop === "nextOut" &&
            node.right.kind === ts.SyntaxKind.NullKeyword
          )
            x = count("U", x);
          return x;
        }
        if (ts.isPropertyAccessExpression(node)) {
          const parent = node.parent,
            isWrite =
              ts.isBinaryExpression(parent) &&
              parent.left === node &&
              parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
          if (
            !isWrite &&
            searchFunctions.has(functionName) &&
            propertyReads.has(node.name.text)
          )
            return count("S", ts.visitEachChild(node, visit, ctx));
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(sf) === "profileRuntimeCounter" &&
          node.arguments[0]?.text === "trackingEdgeMoved"
        )
          return inc("M");
        return ts.visitEachChild(node, visit, ctx);
      };
      return (node) => ts.visitNode(node, visit);
    },
  ]);
  const text =
    "const __cost = globalThis.__rotationCost;\n" +
    ts.createPrinter().printFile(result.transformed[0]);
  result.dispose();
  return text;
}
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

export async function build() {
  fs.mkdirSync(output, { recursive: true });
  const entry = path.join(root, "src/protocol/index.ts");
  for (const variant of ["move", "rotate"])
    for (const structural of [false, true]) {
      const bundle = await rollup({
        input: entry,
        onwarn(w, warn) {
          if (w.code !== "CIRCULAR_DEPENDENCY") warn(w);
        },
        plugins: [
          {
            name: "rotation-experiment",
            resolveId(source, importer) {
              let r;
              if (source.startsWith("@runtime/"))
                r = path.join(root, "src", source.slice(9));
              else if (source.startsWith(".") && importer)
                r = path.resolve(path.dirname(importer), source);
              else if (path.isAbsolute(source)) r = source;
              if (!r) return null;
              for (const c of [r, r + ".ts", path.join(r, "index.ts")])
                if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
              return null;
            },
            load(id) {
              if (!id.endsWith(".ts")) return null;
              let code = overlay(fs.readFileSync(id, "utf8"), id, variant);
              if (id === entry)
                code +=
                  '\nexport { currentConsumer, runtimeState } from "../kernel/state";\nexport { ' +
                  helper +
                  ' } from "../kernel/shape/graph/edgeList";\n';
              return structural ? instrument(code, id, variant) : code;
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
        /__rotationCost|__cost|profileRuntimeCounter\(/.test(
          fs.readFileSync(file, "utf8"),
        )
      )
        throw new Error("Timing counters leaked");
    }
  fs.writeFileSync(path.join(output, "rotation-body.ts.txt"), rotation);
  return {
    sourceSha256: createHash("sha256")
      .update(fs.readFileSync(target))
      .digest("hex"),
    preserveSourceSha256: createHash("sha256")
      .update(
        fs.readFileSync(path.join(root, "src/kernel/shape/graph/reuseEdge.ts")),
      )
      .digest("hex"),
    rotationSha256: createHash("sha256").update(rotation).digest("hex"),
    bundleSha256: Object.fromEntries(
      fs
        .readdirSync(output)
        .filter((x) => x.endsWith(".mjs"))
        .map((x) => [
          x,
          createHash("sha256")
            .update(fs.readFileSync(path.join(output, x)))
            .digest("hex"),
        ]),
    ),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(await build());
