import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const packages = fileURLToPath(new URL("../../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "reflex-library-"));
assert.equal(dirname(temporary), resolve(tmpdir()));
try {
  await writeFile(
    join(temporary, "package.json"),
    '{"private":true,"type":"module"}',
  );
  for (const name of [
    "reflex-runtime",
    "reflex-scheduler",
    "reflex-framework",
    "reflex",
    "reflex-store",
    "reflex-dom",
  ]) {
    const installed = join(temporary, "node_modules/@volynets", name);
    await mkdir(installed, { recursive: true });
    if (name === "reflex-dom") {
      await cp(join(packages, name, "dist"), installed, { recursive: true });
    } else {
      await copyFile(
        join(packages, name, "package.json"),
        join(installed, "package.json"),
      );
      await cp(join(packages, name, "dist"), join(installed, "dist"), {
        recursive: true,
      });
    }
  }
  await writeFile(
    join(temporary, "run.mjs"),
    `
    import assert from "node:assert/strict";
    import * as dom from "@volynets/reflex-dom";
    import * as framework from "@volynets/reflex-framework";
    import * as core from "@volynets/reflex-runtime";
    import * as internal from "@volynets/reflex-runtime/internal";
    import { jsx } from "@volynets/reflex-dom/jsx-runtime";
    import { jsxDEV } from "@volynets/reflex-dom/jsx-dev-runtime";
    import { createStoreCell } from "@volynets/reflex-store/runtime/internal";
    const { JSDOM } = await import(process.argv[2]);
    assert.equal(core.createProducer, internal.createProducer);
    assert.equal(dom.useComputed, framework.useComputed);
    assert.equal(dom.jsx, jsx);
    assert.equal(dom.jsxDEV, jsxDEV);
    for (const effectStrategy of ["eager", "sab", "flush"]) {
      const window = new JSDOM("<main></main>").window;
      try {
        const container = window.document.querySelector("main");
        const renderer = dom.createDOMRenderer({ effectStrategy });
        const cell = createStoreCell(0);
        const cleanup = renderer.render(jsx("p", { children: cell }), container);
        assert.equal(container.textContent, "0");
        renderer.batch(() => cell.set(1));
        renderer.flush();
        assert.equal(container.textContent, "1", effectStrategy + ": Store updates DOM through the shared kernel");
        cleanup();
        renderer.batch(() => cell.set(2));
        renderer.flush();
        assert.equal(container.childNodes.length, 0);
        cell.dispose();
      } finally { window.close(); }
    }
    console.log("Library artifacts passed: shared framework, JSX, Store/DOM tracking, scheduling and disposal.");
  `,
  );
  const { stdout } = await run(
    process.execPath,
    [join(temporary, "run.mjs"), pathToFileURL(require.resolve("jsdom")).href],
    { cwd: temporary },
  );
  process.stdout.write(stdout);
  const consumer = (
    await readFile(new URL("standalone-consumer.tsx", import.meta.url), "utf8")
  ).replaceAll("@volynets/reflex-dom/standalone", "@volynets/reflex-dom");
  await writeFile(join(temporary, "consumer.tsx"), consumer);
  for (const module of ["NodeNext", "ESNext"]) {
    await writeFile(
      join(temporary, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module,
          moduleResolution: module === "NodeNext" ? "NodeNext" : "Bundler",
          jsx: "react-jsx",
          jsxImportSource: "@volynets/reflex-dom",
          strict: true,
          skipLibCheck: false,
          types: [],
          noEmit: true,
        },
        files: ["consumer.tsx"],
      }),
    );
    try {
      await run(
        process.execPath,
        [
          require.resolve("typescript/bin/tsc"),
          "-p",
          join(temporary, "tsconfig.json"),
        ],
        { cwd: temporary },
      );
    } catch (error) {
      throw new Error(
        module +
          ": library consumer typecheck failed\n" +
          error.stdout +
          error.stderr,
        { cause: error },
      );
    }
  }
  console.log(
    "Library JSX declarations passed with strict peer types in NodeNext and Bundler.",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
