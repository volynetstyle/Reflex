// Run records. Every command that decides something writes one JSON record
// (schema `testkit.<command>`, version 1) beside its console output, so a
// result can be cited, diffed and archived without re-running it.
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";

import { packageRelative, reportsDir } from "./paths.mjs";

export function environment() {
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: `${process.platform}-${process.arch}`,
    cpu: cpus()[0]?.model ?? "unknown",
  };
}

/**
 * Writes `record` to `file`, or to .cache/testkit/reports/<time>-<kind>.json
 * when `file` is undefined. Returns the path written.
 */
export function writeReport(kind, record, file) {
  const target =
    file ??
    path.join(
      reportsDir,
      `${new Date().toISOString().replaceAll(":", "-")}-${kind}.json`,
    );
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(
    target,
    `${JSON.stringify(
      {
        schema: `testkit.${kind}`,
        schemaVersion: 1,
        writtenAt: new Date().toISOString(),
        environment: environment(),
        ...record,
      },
      null,
      2,
    )}\n`,
  );
  return target;
}

export function printReportPath(file) {
  console.log(`record: ${packageRelative(file)}`);
}

/** A fixed-width table; `columns` picks and orders the keys of each row. */
export function table(rows, columns = Object.keys(rows[0] ?? {})) {
  if (rows.length === 0) return "(none)";
  const cells = rows.map((row) => columns.map((key) => String(row[key] ?? "")));
  const widths = columns.map((key, i) =>
    Math.max(key.length, ...cells.map((line) => line[i].length)),
  );
  const line = (values) =>
    values
      .map((value, i) => value.padEnd(widths[i]))
      .join("  ")
      .trimEnd();
  return [
    line(columns),
    line(widths.map((width) => "-".repeat(width))),
    ...cells.map(line),
  ].join("\n");
}

export function formatMs(ms) {
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  if (ms < 120_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}
