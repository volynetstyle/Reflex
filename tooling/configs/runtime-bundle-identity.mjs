// Requires the production runtime bundle to stay byte-identical to its base.
//
//   node tooling/configs/runtime-bundle-identity.mjs --base <sha> --head <sha> [--allow-change] [--output file.json]
//
// Both revisions are built by this checkout's oracle builder
// (packages/reflex-runtime/scripts/build-baseline-oracle.mjs --production), so
// only the runtime sources differ between the two bundles, never the toolchain.
// The core's machine-code shape is the accepted performance baseline: a change
// needs an explicit, reviewed override (--allow-change, set by CI from the
// `runtime-bundle-change` pull request label) and a paired benchmark run.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { repoRoot } from "../build/package-registry.mjs";
import { argument } from "./quality-registry.mjs";

const args = process.argv.slice(2);
const base = argument(args, "--base"), head = argument(args, "--head");
if (!base || !head) throw new Error("Usage: runtime-bundle-identity.mjs --base <sha> --head <sha> [--allow-change] [--output file]");
const allowChange = args.includes("--allow-change");
const builder = resolve(repoRoot, "packages/reflex-runtime/scripts/build-baseline-oracle.mjs");
const work = mkdtempSync(join(tmpdir(), "reflex-bundle-identity-"));

function build(commit, label) {
  const out = join(work, label);
  execFileSync(process.execPath, [builder, "--commit", commit, "--production", "--out", out], { cwd: resolve(repoRoot, "packages/reflex-runtime"), stdio: ["ignore", "ignore", "inherit"] });
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
  return { commit, sha256: manifest.bundleSha256, bytes: readFileSync(join(out, "runtime.mjs")).length };
}

let result;
try {
  const before = build(base, "base"), after = base === head ? before : build(head, "head");
  const identical = before.sha256 === after.sha256;
  result = { schemaVersion: 1, check: "runtime-bundle-identity", base: before, head: after, identical, allowChange, status: identical ? "identical" : allowChange ? "changed-approved" : "changed" };
} finally {
  rmSync(work, { recursive: true, force: true });
}
const output = argument(args, "--output");
if (output) writeFileSync(resolve(output), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
if (result.status === "changed") {
  console.log(`::error title=Runtime bundle changed::The production runtime bundle differs from ${base.slice(0, 12)} (${result.base.bytes} → ${result.head.bytes} bytes). Keep generated code identical, or add the runtime-bundle-change label after a paired benchmark run.`);
  process.exitCode = 1;
} else if (result.status === "changed-approved") {
  console.log(`::notice title=Runtime bundle changed (approved)::${result.base.sha256.slice(0, 12)} → ${result.head.sha256.slice(0, 12)}; approved by the runtime-bundle-change label.`);
}
