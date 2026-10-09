import test from "node:test";
import assert from "node:assert/strict";
import { fingerprintInputs, inputOwner } from "./ci-fingerprints.mjs";

const entries = [
  { name: "runtime", path: "packages/runtime", publish: true },
  { name: "facade", path: "packages/facade", publish: true },
  { name: "app", path: "packages/facade/examples/app", publish: false },
  { name: "independent", path: "packages/independent", publish: false },
];
const manifests = { runtime: {}, facade: { peerDependencies: { runtime: "workspace:*" } }, app: { dependencies: { facade: "workspace:*" } }, independent: {} };
const file = (path, content = "original") => ({ path, content, mode: 0 });
const files = [file("pnpm-lock.yaml"), file("tooling/build.mjs"), ...entries.map(entry => file(entry.path + "/src/index.ts"))];
const calculate = (input = files, options = {}) => fingerprintInputs({ entries, manifests, files: input, phase: "pr", ...options });

test("upstream edits invalidate dependents, while unrelated packages reuse evidence", () => {
  const before = calculate();
  const after = calculate(files.map(item => item.path === "packages/runtime/src/index.ts" ? { ...item, content: "changed" } : item));
  for (const name of ["runtime", "facade", "app"]) assert.notEqual(before.packages[name], after.packages[name]);
  assert.equal(before.packages.independent, after.packages.independent);
  assert.notEqual(before.consumer, after.consumer);
});
test("shared inputs and phase invalidate every package", () => {
  const before = calculate();
  for (const after of [calculate([...files, file("eslint.config.mjs")]), calculate(files, { phase: "deep" })]) {
    for (const entry of entries) assert.notEqual(before.packages[entry.name], after.packages[entry.name]);
  }
});
test("documentation is ignored; additions, deletions and executable mode change keys", () => {
  const before = calculate();
  assert.deepEqual(calculate([...files, file("packages/runtime/README.md")]), before);
  for (const input of [[...files, file("packages/runtime/src/new.ts")], files.filter(item => item.path !== "packages/runtime/src/index.ts"), files.map(item => item.path === "packages/runtime/src/index.ts" ? { ...item, mode: 0o111 } : item)]) assert.notEqual(calculate(input).packages.runtime, before.packages.runtime);
  assert.notEqual(calculate([...files, file("AGENTS.md")]).packages.runtime, before.packages.runtime);
});
test("nested apps own their inputs and source imports add undeclared dependency edges", () => {
  assert.equal(inputOwner("packages/facade/examples/app/src/index.ts", entries).name, "app");
  const before = calculate();
  const appEdit = calculate(files.map(item => item.path.includes("examples/app/") ? { ...item, content: "changed" } : item));
  assert.equal(before.consumer, appEdit.consumer);
  const sources = files.map(item => item.path === "packages/independent/src/index.ts" ? { ...item, content: 'import "../../runtime/src/index.ts";' } : item);
  const after = calculate(sources.map(item => item.path === "packages/runtime/src/index.ts" ? { ...item, content: "changed" } : item));
  assert.notEqual(calculate(sources).packages.independent, after.packages.independent);
});
test("binary inputs are hashed as bytes without UTF-8 replacement collisions", () => {
  assert.notEqual(calculate([...files, file("packages/runtime/fixture.bin", Buffer.from([0xff]))]).packages.runtime, calculate([...files, file("packages/runtime/fixture.bin", Buffer.from([0xfe]))]).packages.runtime);
});
