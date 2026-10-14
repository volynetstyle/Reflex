// Splits the workload registry into balanced shards for parallel CI jobs.
//
//   node bench/shards.mjs [--shards 9] [--workloads <regex>]
//
// Prints a GitHub Actions matrix: {"include":[{shard, label, workloads,
// family}]}. Every pair process is dominated by its fixed warm-up, so the
// cost of a shard is proportional to its workload count and round-robin over
// the registry balances shards to within one workload. Each shard carries
// the size of the whole timed family, so its intervals keep the multiplicity
// correction of an unsharded run.
import { workloads } from "./workloads.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const pattern = new RegExp(option("--workloads", ".*"));
const selected = workloads.filter((w) => pattern.test(w.id));
const family = selected.filter((w) => !w.memory).length;
const count = Math.max(
  1,
  Math.min(Number(option("--shards", 9)) || 1, selected.length),
);

const buckets = Array.from({ length: count }, () => []);
selected.forEach((w, index) => buckets[index % count].push(w.id));

const escape = (id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const include = buckets.map((ids, index) => ({
  shard: `${index + 1}-of-${count}`,
  label: ids.join(", "),
  workloads: `^(${ids.map(escape).join("|")})$`,
  family,
}));
process.stdout.write(`${JSON.stringify({ include })}\n`);
