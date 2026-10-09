import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { options, required, readJson, writeJson, sha256, runId } from "./io.mjs";
import { makeEnvelope } from "./schema.mjs";
export function main(argv = process.argv.slice(2)) {
  const opts = options(argv, ["--input", "--output", "--suite"]);
  const path = required(opts, "input"), data = readJson(path), bytes = readFileSync(path);
  if (data.format === "reflex-benchmark-run") throw new Error("Input is already an envelope");
  if (!data.files && !data.benchmarks && !data.rows && !data.scenarios) throw new Error("Unsupported historical data shape; do not guess an adapter");
  const metadata = data.metadata ?? {}, environment = data.env ?? Object.fromEntries(["node", "v8", "cpu", "platform", "arch"].filter(k => metadata[k] != null).map(k => [k, metadata[k]]));
  const report = makeEnvelope(data, { runId: runId(), suite: opts.suite ?? data.suite ?? "legacy-experiment", environment,
    protocol: { sampleDefinition: metadata.tailMeaning ?? metadata.note ?? "unknown legacy sample definition", operationDefinition: "see original experiment README", timingUnit: metadata.timingUnit ?? "unknown" },
    artifacts: [{ path: basename(path), bytes: bytes.length, sha256: sha256(bytes) }] });
  writeJson(required(opts, "output"), report);
  console.log("Adapted historical bytes without modifying input; provenance remains partial.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
