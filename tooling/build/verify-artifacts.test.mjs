import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { verifyFiles, verifyDirectory } from "./verify-artifacts.mjs";

function fixture(source = "export const value = 1;", extra = {}) {
  return new Map(Object.entries({
    "package.json": JSON.stringify({ name: "artifact-fixture", version: "1.0.0", type: "module", exports: { ".": { import: "./index.js" } } }),
    "index.js": source,
    ...extra,
  }).map(([path, content]) => [path, Buffer.from(content)]));
}

test("diagnostic flag names in strings and property names are data", () => {
  const files = fixture('export const flags = { __DEV__: false, __PROFILE__: "__DEV__" }; export const value = flags.__DEV__;');
  assert.equal(verifyFiles(files).name, "artifact-fixture");
});

test("unreplaced executable compiler identifiers fail qualification", () => {
  assert.throws(() => verifyFiles(fixture("export const enabled = typeof __PROFILE__ !== 'undefined' && __PROFILE__;")), /unresolved production build flags.*__PROFILE__/);
});

test("an existing exported entry does not hide a missing shared chunk", () => {
  assert.throws(() => verifyFiles(fixture("export { value } from './chunks/missing.js';")), /unresolved artifact import.*missing\.js/);
});

test("every conditional export target is verified", () => {
  const files = fixture();
  files.set("package.json", Buffer.from(JSON.stringify({ name: "artifact-fixture", version: "1.0.0", type: "module", exports: { ".": { import: { development: "./missing.js", default: "./index.js" } } } })));
  assert.throws(() => verifyFiles(files), /missing.*development target/);
});

test("declarations require their own local resolution closure", () => {
  const files = fixture();
  files.set("package.json", Buffer.from(JSON.stringify({ name: "artifact-fixture", version: "1.0.0", type: "module", exports: { ".": { types: "./index.d.ts", import: "./index.js" } } })));
  files.set("index.d.ts", Buffer.from('export type { Missing } from "./missing.js";'));
  assert.throws(() => verifyFiles(files), /unresolved artifact import.*index\.d\.ts/);
});

test("standalone declarations cannot acquire ecosystem dependencies", () => {
  const files = fixture();
  files.set("package.json", Buffer.from(JSON.stringify({ name: "artifact-fixture", version: "1.0.0", type: "module", peerDependencies: { "@volynets/reflex-runtime": "^1.0.0" }, exports: { "./standalone": { types: "./standalone/index.d.ts" } } })));
  files.set("standalone/index.d.ts", Buffer.from('export type { ProducerNode } from "@volynets/reflex-runtime";'));
  assert.throws(() => verifyFiles(files), /Standalone depends on external module/);
});

test("publication directories use their finalized manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reflex-verifier-test-"));
  const local = relative(resolve(tmpdir()), resolve(directory));
  assert.match(local, /^reflex-verifier-test-[^/\\]+$/);
  try {
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: "artifact-fixture", version: "1.0.0", type: "module", publishConfig: { directory: "dist" }, exports: { ".": { import: "./dist/missing.js" } } }));
    await mkdir(join(directory, "dist"));
    await writeFile(join(directory, "dist/package.json"), JSON.stringify({ name: "artifact-fixture", version: "1.0.0", type: "module", exports: { ".": { import: "./index.js" } } }));
    await writeFile(join(directory, "dist/index.js"), "export const value = 1;");
    const result = await verifyDirectory(directory);
    assert.equal(result.publicationRoot, join(directory, "dist"));
    assert.equal(result.exportTargets, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
