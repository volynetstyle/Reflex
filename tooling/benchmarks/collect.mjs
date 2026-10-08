import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { cpus, arch, platform, release, totalmem } from "node:os";
import { options, readJson, writeJson, writeImmutable, runId, sha256 } from "./io.mjs";
import { assertRaw, assertNormalized, makeEnvelope } from "./schema.mjs";
import { protocolManifest } from "./protocol.mjs";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));
const keys = { w: "writes", sr: "sinkReads", pr: "producerReads", cr: "consumerReads", runs: "computeRuns", cand: "recomputeCandidates", inv: "invalidated", edge: "edgeTraversals", sched: "scheduledWatchers", flush: "flushes", add: "depsAdded", drop: "depsDropped", wc: "watchersCreated", wd: "watchersDisposed" };
export function normalizeRaw(raw, env, commit = null) {
  assertRaw(raw);
  const benchmarks = raw.files.flatMap(file => file.groups.flatMap(group => group.benchmarks.map(b => {
    const marker = "runtime taxonomy | ", start = group.fullName.indexOf(marker), rest = start < 0 ? group.fullName : group.fullName.slice(start + marker.length), [pressure, ...parts] = rest.split(" | "), id = parts.join(" | ") || rest;
    const work = Object.fromEntries(Object.values(keys).map(k => [k, 0]));
    for (const token of b.name.replace(/^measure\s+\|\s+/, "").split(/\s+/)) {
      const [key, value] = token.split("=");
      if (Object.hasOwn(keys, key)) { const n = Number(value); if (!Number.isFinite(n) || n < 0) throw new Error("Invalid workload counter " + token); work[keys[key]] = n; }
    }
    const perUnit = count => count > 0 ? b.mean * 1000 / count : null;
    return { id, pressure, label: id, meanMs: b.mean, medianMs: b.median ?? null, p75Ms: b.p75 ?? null, p99Ms: b.p99 ?? null, p999Ms: b.p999 ?? null, minMs: b.min ?? null, maxMs: b.max ?? null, hz: b.hz ?? null, rme: b.rme, samples: b.sampleCount, work, derived: { meanUsPerEdge: perUnit(work.edgeTraversals), meanUsPerRun: perUnit(work.computeRuns), meanUsPerRecomputeCandidate: perUnit(work.recomputeCandidates), meanUsPerInvalidation: perUnit(work.invalidated), meanUsPerDepChurn: perUnit(work.depsAdded + work.depsDropped) } };
  })));
  return assertNormalized({ schemaVersion: 1, suite: "runtime-taxonomy", generatedAt: new Date().toISOString(), commit, env, benchmarks });
}
export function main(argv = process.argv.slice(2)) {
  const opts = options(argv, ["--raw", "--out", "--run-dir"], ["--skip-run"]);
  if (opts["skip-run"] && !opts.raw) throw new Error("--skip-run requires --raw");
  if (opts.out && existsSync(resolve(opts.out))) throw new Error("Refusing to overwrite evidence: " + opts.out);
  const id = runId(), directory = resolve(opts["run-dir"] ?? resolve(root, ".cache/benchmarks", id));
  mkdirSync(dirname(directory), { recursive: true }); mkdirSync(directory);
  const rawPath = resolve(directory, "raw.json");
  if (opts["skip-run"]) writeImmutable(rawPath, readFileSync(resolve(opts.raw)));
  else {
    if (opts.raw) throw new Error("--raw is an existing input only; use --run-dir to choose output");
    const cli = resolve(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
    const result = spawnSync(process.execPath, [cli, "bench", "--run", "test/perf/runtime-taxonomy.bench.ts", "--outputJson", rawPath], { cwd: resolve(root, "packages/reflex-runtime"), stdio: "inherit", windowsHide: true });
    if (result.error || result.status !== 0) throw new Error("Benchmark process failed: " + (result.error?.message ?? result.status));
  }
  const rawBytes = readFileSync(rawPath), raw = readJson(rawPath);
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }), commit = git.status === 0 ? git.stdout.trim() : null;
  const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true });
  const env = { node: process.version, v8: process.versions.v8, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? "unknown", cpuCount: cpus().length, totalMemoryMb: Math.round(totalmem() / 1024 / 1024), ci: process.env.CI === "true", providerVersion: JSON.parse(readFileSync(require.resolve("vitest/package.json"), "utf8")).version };
  const originalEnv = opts["skip-run"] ? { node: "unknown", v8: "unknown", platform: "unknown", arch: "unknown", cpu: "unknown" } : env;
  const report = normalizeRaw(raw, originalEnv, opts["skip-run"] ? null : commit), protocol = protocolManifest(root, ["packages/reflex-runtime/test/perf/runtime-taxonomy.bench.ts", "packages/reflex-runtime/vite.config.ts"]);
  const envelope = makeEnvelope(report, {
    runId: id, environment: originalEnv, protocolHash: opts["skip-run"] ? null : protocol.protocolHash,
    provenance: { sourceCommit: opts["skip-run"] ? null : commit, workingTreeDirty: opts["skip-run"] ? null : dirty.status === 0 ? dirty.stdout.length > 0 : null, lockfileHash: sha256(readFileSync(resolve(root, "pnpm-lock.yaml"))), status: "partial", unknownFields: opts["skip-run"] ? ["original-environment", "original-source", "original-operation-and-validation", "original-process-design"] : ["independent-process-design", "observable-result-validation"] },
    protocol: { sampleDefinition: "Vitest within-process samples; one process", operationDefinition: "runtime taxonomy scenario", timingUnit: "ms", tailMeaning: "provider sample latency, not application frame latency" },
    validation: { status: "unverified", failures: [], reason: "schema validation does not independently verify observable semantics" },
    artifacts: [{ path: "raw.json", bytes: rawBytes.length, sha256: sha256(rawBytes) }]
  });
  // External raw data keeps its unknown original provenance; current machine
  // versions describe adaptation only and are never presented as its source.
  if (opts["skip-run"]) envelope.provenance.adaptedOn = env;
  writeJson(resolve(directory, "protocol.json"), protocol);
  writeJson(resolve(directory, "normalized.json"), report);
  writeJson(resolve(directory, "report.json"), envelope);
  if (opts.out) writeJson(resolve(opts.out), envelope);
  console.log("Immutable benchmark run: " + directory);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
