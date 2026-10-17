// Byte identity of the production runtime bundle against a git revision.
//
//   node scripts/check-bundle-identity.mjs [--base <ref>]   (default: HEAD)
//
// Builds the shipped production bundle (minified, constants inlined, the
// same pipeline as the benchmark sides) for <ref> and for the working tree
// and compares their SHA-256. Documentation, comments, types and renames the
// minifier erases keep the bundle identical; any change to behavior or code
// shape does not. On a mismatch, readable builds of both sides are diffed so
// the change can be located.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const at = args.indexOf("--base");
const base = at === -1 ? "HEAD" : args[at + 1];
const work = mkdtempSync(path.join(tmpdir(), "reflex-bundle-identity-"));

function build(side, readable) {
  const out = path.join(work, `${side}${readable ? "-readable" : ""}`);
  const flags = ["--production", "--out", out];
  if (readable) flags.push("--readable");
  flags.push(...(side === "base" ? ["--commit", base] : ["--source"]));
  execFileSync(
    process.execPath,
    [path.join(packageRoot, "scripts/build-baseline-oracle.mjs"), ...flags],
    { cwd: packageRoot, stdio: ["ignore", "ignore", "inherit"] },
  );
  const code = readFileSync(path.join(out, "runtime.mjs"));
  return { code, sha: createHash("sha256").update(code).digest("hex") };
}

try {
  const before = build("base", false);
  const after = build("source", false);
  if (before.sha === after.sha) {
    console.log(`identical to ${base}: ${after.sha.slice(0, 16)} (${after.code.length} bytes)`);
  } else {
    const a = build("base", true).code.toString("utf8").split("\n");
    const b = build("source", true).code.toString("utf8").split("\n");
    let first = 0;
    while (first < a.length && a[first] === b[first]) first++;
    console.error(`bundle differs from ${base}`);
    console.error(`  base   ${before.sha.slice(0, 16)} (${before.code.length} bytes)`);
    console.error(`  source ${after.sha.slice(0, 16)} (${after.code.length} bytes)`);
    console.error(`  first readable difference at line ${first + 1}:`);
    for (let i = first; i < Math.min(first + 6, Math.max(a.length, b.length)); i++) {
      if (a[i] !== undefined) console.error(`  - ${a[i]}`);
      if (b[i] !== undefined) console.error(`  + ${b[i]}`);
    }
    process.exitCode = 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
