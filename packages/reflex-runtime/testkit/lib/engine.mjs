// Pairwise trace comparison over generated programs: the engine behind
// `diff`, `mutate` and the A/A control. One shard runs seeds
// first + shard, first + shard + stride, ... of every family, round-robin
// across families, so a time-boxed run spreads its budget evenly and the
// union of shards is the same seed set as one inline run.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { packageRoot } from "./paths.mjs";

let oracle;
/** The oracle modules (TypeScript, loaded through Node's type stripping). */
export async function loadOracle() {
  if (oracle === undefined) {
    const load = (file) =>
      import(
        pathToFileURL(path.join(packageRoot, "testkit/oracle", file)).href
      );
    const [program, families, verdict, reduce] = await Promise.all([
      load("program.ts"),
      load("families.ts"),
      load("verdict.ts"),
      load("reduce.ts"),
    ]);
    oracle = { program, families, verdict, reduce };
  }
  return oracle;
}

export function emptyRow() {
  return {
    programs: 0,
    identical: 0,
    accepted: {},
    inconclusive: 0,
    divergent: 0,
    crashed: 0,
  };
}

function mergeRow(into, row) {
  into.programs += row.programs;
  into.identical += row.identical;
  into.inconclusive += row.inconclusive;
  into.divergent += row.divergent;
  into.crashed += row.crashed;
  for (const [name, count] of Object.entries(row.accepted))
    into.accepted[name] = (into.accepted[name] ?? 0) + count;
}

/**
 * Runs one shard in this thread.
 *
 * task: { families: [{ id, first, count }], levels, policy, shard, stride,
 *         deadline (epoch ms or null), maxFailures (0 = unlimited) }
 * Returns { rows: { "<family>/<level>": row }, failures, inconclusive,
 * timedOut }.
 */
export async function runShard(reference, candidate, task) {
  const { program: p, families, verdict } = await loadOracle();
  const rows = {};
  const failures = [];
  const inconclusive = [];
  let timedOut = false;
  const generators = task.families.map((entry) => ({
    ...entry,
    family: families.family(entry.id),
  }));
  outer: for (let k = 0; ; k++) {
    let active = false;
    for (const { id, first, count, family } of generators) {
      const offset = task.shard + k * task.stride;
      if (offset >= count) continue;
      active = true;
      if (task.deadline !== null && Date.now() >= task.deadline) {
        timedOut = true;
        break outer;
      }
      const seed = first + offset;
      const program = family.generate(seed);
      for (const level of task.levels) {
        const row = (rows[`${id}/${level}`] ??= emptyRow());
        row.programs++;
        let result;
        try {
          result = verdict.judge(
            reference,
            candidate,
            program,
            level,
            task.policy,
          );
        } catch (error) {
          row.crashed++;
          failures.push({
            family: id,
            seed,
            level,
            kind: "crash",
            error: `${error?.name}: ${error?.message}`,
          });
          continue;
        }
        if (result.kind === "identical") row.identical++;
        else if (result.kind === "inconclusive") {
          row.inconclusive++;
          inconclusive.push({ family: id, seed, level, reason: result.reason });
        } else if (result.kind === "accepted")
          row.accepted[result.class] = (row.accepted[result.class] ?? 0) + 1;
        else {
          row.divergent++;
          failures.push({
            family: id,
            seed,
            level,
            kind: "divergent",
            mismatch: result.mismatch,
            size: p.programSize(program),
          });
        }
      }
      if (task.maxFailures > 0 && failures.length >= task.maxFailures)
        break outer;
    }
    if (!active) break;
  }
  return { rows, failures, inconclusive, timedOut };
}

/** Runs `jobs` shards, in worker threads when jobs > 1, and merges them. */
export async function runSharded(sides, task, jobs) {
  const results =
    jobs <= 1
      ? [
          await runShard(sides.referenceModule, sides.candidateModule, {
            ...task,
            shard: 0,
            stride: 1,
          }),
        ]
      : await Promise.all(
          Array.from(
            { length: jobs },
            (_, shard) =>
              new Promise((resolve, reject) => {
                const worker = new Worker(
                  new URL("./engine-worker.mjs", import.meta.url),
                  {
                    workerData: {
                      referenceFile: sides.reference.file,
                      candidateFile: sides.candidate.file,
                      task: { ...task, shard, stride: jobs },
                    },
                  },
                );
                worker.once("message", resolve);
                worker.once("error", reject);
                worker.once("exit", (code) => {
                  if (code !== 0)
                    reject(new Error(`shard ${shard} exited with ${code}`));
                });
              }),
          ),
        );
  const rows = {};
  const failures = [];
  const inconclusive = [];
  let timedOut = false;
  for (const result of results) {
    for (const [key, row] of Object.entries(result.rows))
      mergeRow((rows[key] ??= emptyRow()), row);
    failures.push(...result.failures);
    inconclusive.push(...result.inconclusive);
    timedOut ||= result.timedOut;
  }
  failures.sort(
    (a, b) =>
      a.family.localeCompare(b.family) ||
      a.seed - b.seed ||
      a.level.localeCompare(b.level),
  );
  return { rows, failures, inconclusive, timedOut };
}
