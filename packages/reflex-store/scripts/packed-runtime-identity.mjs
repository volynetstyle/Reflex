import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { resolve, join, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire, builtinModules } from "node:module";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const pnpm = process.env.npm_execpath;
if (!pnpm || (!pnpm.endsWith(".cjs") && !pnpm.endsWith(".js")))
  throw new Error("Run this check through pnpm test:packed-runtime");
const scratch = mkdtempSync(join(tmpdir(), "reflex-store-packed-"));
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0)
    throw new Error(
      (result.stdout ?? "") +
        (result.stderr ?? "") +
        "\nCommand failed: " +
        args.join(" "),
    );
  return result.stdout;
}
function pnpmRun(args, cwd) {
  return run(process.execPath, [pnpm, ...args], cwd);
}
try {
  const dependencies = {};
  for (const name of [
    "reflex-runtime",
    "reflex-scheduler",
    "reflex-framework",
    "reflex",
    "reflex-store",
  ]) {
    const cwd = resolve(packageRoot, "..", name);
    pnpmRun(["pack", "--pack-destination", scratch], cwd);
    const archive = readdirSync(scratch).find(
      (file) =>
        file.startsWith("volynets-" + name + "-") && file.endsWith(".tgz"),
    );
    assert(archive, "Missing tarball for " + name);
    dependencies["@volynets/" + name] = "file:" + join(scratch, archive);
  }
  writeFileSync(
    join(scratch, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies,
      // Resolve unpublished workspace versions from the tarballs at every level.
      pnpm: { overrides: dependencies },
    }),
  );
  pnpmRun(
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--config.node-linker=isolated",
    ],
    scratch,
  );
  const installed = join(scratch, "node_modules/@volynets/reflex-store");
  const manifest = JSON.parse(
    readFileSync(join(installed, "package.json"), "utf8"),
  );
  for (const name of ["dependencies", "optionalDependencies"])
    assert.equal(
      Object.keys(manifest[name] ?? {}).length,
      0,
      name + " must be empty",
    );
  assert(existsSync(join(installed, "dist/compiler/swc.wasm")));
  assert.deepEqual(manifest.peerDependencies, {
    "@volynets/reflex": "^1.0.0",
    "@volynets/reflex-runtime": "^1.0.0",
    "@volynets/reflex-framework": "^0.1.3",
  });
  function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(directory, entry.name))
        : [join(directory, entry.name)],
    );
  }
  for (const file of files(join(installed, "dist")).filter((file) =>
    /\.(?:js|d\.ts)$/.test(file),
  )) {
    const code = readFileSync(file, "utf8");
    const ts = require("typescript");
    const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    const imports = [];
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      )
        imports.push(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        imports.push(node.argument.literal.text);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require")) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        imports.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    for (const id of imports)
      assert(
        id.startsWith(".") ||
          id.startsWith("node:") ||
          builtinModules.includes(id) ||
          Object.keys(manifest.peerDependencies).some(
            (name) => id === name || id.startsWith(name + "/"),
          ),
        "External dependency in " + file + ": " + id,
      );
  }

  writeFileSync(
    join(scratch, "run.mjs"),
    [
      'import assert from "node:assert/strict";',
      'import {writeFileSync} from "node:fs";',
      'import {createStore,reactiveMap,derive,selector,action,snapshot,hydrate} from "@volynets/reflex-store";',
      'import {createRuntime,effect,signal,createModel,own} from "@volynets/reflex-store/runtime";',
      'import * as facade from "@volynets/reflex"; import * as core from "@volynets/reflex-runtime"; import * as internal from "@volynets/reflex-runtime/internal";',
      'import * as storeCore from "@volynets/reflex-store/runtime/core";',
      "assert.equal(createRuntime,facade.createRuntime);assert.equal(core.createProducer,internal.createProducer);assert.equal(storeCore.getActiveRuntimeContext,core.getActiveRuntimeContext);",
      'import {compileStore} from "@volynets/reflex-store/store";',
      'import plugin from "@volynets/reflex-store/vite";',
      'import {createStoreCell} from "@volynets/reflex-store/runtime/internal";',
      'import "@volynets/reflex-store/advanced"; import "@volynets/reflex-store/selectors";',
      'const runtime=createRuntime({effectStrategy:"eager"});',
      'const map=reactiveMap([["a",1]]); const view=derive(()=>({value:map.get("a")}));',
      "const seen=[]; const stop=effect(()=>{seen.push(view.value)});",
      'action(()=>{map.set("a",2);map.set("a",3)})(); assert.deepEqual(seen,[1,3]);stop();',
      "const source='import {createStore,leaf} from \"@volynets/reflex-store\"; export function make(){const state=createStore({a:0,b:0,items:leaf([]),get sum(){return this.a+this.b},update(){this.a=1;this.b=2}});return state;}';",
      'writeFileSync(new URL("./compiled.mjs",import.meta.url),compileStore(source,"model.js").code);',
      'const {make}=await import("./compiled.mjs");const first=make(),second=make();',
      "const renders=[];const end=effect(()=>{renders.push(first.sum)});first.update();",
      "hydrate(first,{a:4,b:5,items:[]});assert.deepEqual(renders,[0,3,9]);",
      "assert.deepEqual(snapshot(first),{a:4,b:5,items:[]});assert.equal(second.sum,0);end();",
      'const selected=signal("a");const model=createModel(ctx=>({map:own(ctx,map),view:own(ctx,view),selected:own(ctx,selector(selected))}))();',
      'model.dispose();assert.throws(()=>map.get("a"),/disposed/);first.dispose();second.dispose();',
      'assert.equal(typeof createStoreCell,"function");assert.equal("config" in plugin(),false);',
      'runtime.flush();console.log("Library tarballs: shared graph, compiler, WASM, actions, hydration and ownership passed.");',
    ].join("\n"),
  );
  process.stdout.write(run(process.execPath, ["run.mjs"], scratch));

  const { createServer } = await import("vite");
  const { default: packedPlugin } = await import(
    pathToFileURL(join(installed, "dist/vite.js"))
  );
  writeFileSync(
    join(scratch, "integration.ts"),
    [
      'import {createRuntime,effect} from "@volynets/reflex";',
      'import {createStore,action} from "@volynets/reflex-store";',
      'export function run(){createRuntime({effectStrategy:"eager"});const state=createStore({a:0,b:0});',
      "const seen=[];const stop=effect(()=>{seen.push(state.a+state.b)});action(()=>{state.a=1;state.b=2})();stop();return seen;}",
    ].join("\n"),
  );
  const server = await createServer({
    root: scratch,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [packedPlugin()],
    server: { middlewareMode: true },
    ssr: { noExternal: true },
  });
  try {
    const application = await server.ssrLoadModule("/integration.ts");
    assert.deepEqual(application.run(), [0, 3]);
  } finally {
    await server.close();
  }
  process.stdout.write(
    "Packed Vite integration preserves shared Reflex package imports.\n",
  );

  writeFileSync(
    join(scratch, "consumer.ts"),
    [
      'import {createStore,leaf,snapshot,hydrate,derive,reactiveMap,selector} from "@volynets/reflex-store";',
      'import {createRuntime,createModel,own,signal,createStoreScope,createStoreCell,type Signal} from "@volynets/reflex-store/runtime";',
      'import storePlugin from "@volynets/reflex-store/vite";',
      "createRuntime();",
      "const scoped=createStoreScope(scope=>({cell:scope.own(createStoreCell(1)),increment:scope.action((amount:number)=>amount+1)}));",
      "const incremented:number=scoped.increment(2);scoped[Symbol.dispose]();void incremented;",
      "// @ts-expect-error scope actions cannot return promises",
      "createStoreScope(scope=>({bad:scope.action(()=>Promise.resolve())}));",
      "const state=createStore({a:0,items:leaf<readonly {id:string}[]>([]),get sum(){return this.a*2},update(){this.a++}});",
      "const saved=snapshot(state);const value:number=saved.a;const items:readonly {readonly id:string}[]=saved.items;",
      "// @ts-expect-error actions are excluded from snapshot data",
      "saved.update;",
      "// @ts-expect-error getters are excluded from snapshot data",
      "saved.sum;",
      "hydrate(state,{a:2,items:[]});",
      'const source:Signal<string>=signal("a");',
      "createModel(ctx=>({state:own(ctx,state),map:own(ctx,reactiveMap<string,number>()),selected:own(ctx,selector(source)),view:own(ctx,derive(()=>({value:source()})))}));",
      "storePlugin();void value;void items;",
    ].join("\n"),
  );
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        lib: ["ES2022", "ESNext.Disposable"],
      },
      include: ["consumer.ts"],
    }),
  );
  run(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      join(scratch, "tsconfig.json"),
    ],
    scratch,
  );
  process.stdout.write(
    "Library consumer declarations passed with skipLibCheck=false and shared peers installed.\n",
  );
} finally {
  const absolute = resolve(scratch);
  const temporaryRoot = resolve(tmpdir());
  if (
    !absolute.startsWith(temporaryRoot + sep) ||
    !absolute.includes("reflex-store-packed-")
  )
    // eslint-disable-next-line no-unsafe-finally
    throw new Error("Refusing unsafe temporary cleanup");
  rmSync(absolute, { recursive: true, force: true });
}
