import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
// An optional directory also lets CI validate an extracted npm tarball.
const dist = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../dist/", import.meta.url));
const manifest = JSON.parse(await readFile(join(dist, "package.json"), "utf8"));
const source = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
assert.equal(manifest.name, source.name);
assert.equal(manifest.version, source.version);
for (const field of [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundledDependencies",
  "bundleDependencies",
  "dependenciesMeta",
  "peerDependenciesMeta",
  "scripts",
]) {
  assert.equal(
    field in manifest,
    false,
    `Published manifest must omit ${field}`,
  );
}
assert.equal(manifest.publishConfig.directory, undefined);
assert.deepEqual(Object.keys(manifest.exports), [
  ".",
  "./jsx-runtime",
  "./jsx-dev-runtime",
]);
for (const entry of Object.values(manifest.exports)) {
  assert.deepEqual(Object.keys(entry), ["types", "import"]);
  await readFile(join(dist, entry.types));
  await readFile(join(dist, entry.import));
}

async function checkModules(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await checkModules(path);
      continue;
    }
    if (!/\.(?:js|d\.ts)$/.test(entry.name)) continue;
    const content = await readFile(path, "utf8");
    const info = ts.preProcessFile(content, true, entry.name.endsWith(".js"));
    assert.deepEqual(
      info.typeReferenceDirectives,
      [],
      `${path}: external type reference`,
    );
    for (const { fileName } of [
      ...info.importedFiles,
      ...info.referencedFiles,
    ]) {
      assert.match(
        fileName,
        /^\.\.?\//,
        `${path}: external import ${fileName}`,
      );
      // Declaration imports use the corresponding JavaScript module specifier.
      const resolvedName = entry.name.endsWith(".d.ts")
        ? fileName.replace(/\.js$/, ".d.ts")
        : fileName;
      const target = resolve(dirname(path), resolvedName);
      const local = relative(dist, target);
      assert.ok(
        !local.startsWith("..") && !isAbsolute(local),
        `${path}: import escapes package`,
      );
      await readFile(target);
    }
    if (entry.name.endsWith(".js")) {
      assert.doesNotMatch(
        content,
        /\b__(?:DEV|TEST|PROD|PROFILE|TRACKING_\w+)__\b/,
        `${path}: build flag`,
      );
    }
  }
}
await checkModules(dist);

// No parent node_modules from the repository can satisfy missing package imports.
const temporary = await mkdtemp(join(tmpdir(), "reflex-dom-standalone-"));
assert.equal(dirname(temporary), resolve(tmpdir()));
try {
  const installed = join(
    temporary,
    "node_modules",
    ...manifest.name.split("/"),
  );
  await mkdir(dirname(installed), { recursive: true });
  await cp(dist, installed, { recursive: true });
  await writeFile(
    join(temporary, "package.json"),
    '{"private":true,"type":"module"}\n',
  );
  await copyFile(
    new URL("standalone-runtime.mjs", import.meta.url),
    join(temporary, "runtime.mjs"),
  );
  await copyFile(
    new URL("standalone-consumer.tsx", import.meta.url),
    join(temporary, "consumer.tsx"),
  );

  const { stdout } = await run(
    process.execPath,
    [
      "--conditions=source",
      join(temporary, "runtime.mjs"),
      pathToFileURL(require.resolve("jsdom")).href,
    ],
    { cwd: temporary },
  );
  process.stdout.write(stdout);

  for (const [module, jsx] of [
    ["NodeNext", "react-jsx"],
    ["NodeNext", "react-jsxdev"],
    ["ESNext", "react-jsx"],
    ["ESNext", "react-jsxdev"],
  ]) {
    const config = {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module,
        moduleResolution: module === "NodeNext" ? "NodeNext" : "Bundler",
        jsx,
        jsxImportSource: manifest.name,
        strict: true,
        skipLibCheck: false,
        types: [],
        noEmit: true,
      },
      files: ["consumer.tsx"],
    };
    await writeFile(join(temporary, "tsconfig.json"), JSON.stringify(config));
    try {
      await run(
        process.execPath,
        [
          require.resolve("typescript/bin/tsc"),
          "-p",
          join(temporary, "tsconfig.json"),
        ],
        {
          cwd: temporary,
        },
      );
    } catch (error) {
      throw new Error(
        `${module}/${jsx}: isolated consumer typecheck failed\n${error.stdout}${error.stderr}`,
        { cause: error },
      );
    }
  }
  console.log(
    "Standalone package passed: no dependencies, closed module graph, shared JSX runtime, strict JSX types (NodeNext and Bundler).",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
