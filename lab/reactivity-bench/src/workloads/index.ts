import type { SuiteName, WorkloadDefinition } from "../types.js";
export { vue12349Corrected } from "./corrected.js";
export { diagnostics } from "./diagnostic.js";
export { vue12349Exact } from "./vue-exact.js";
import { vue12349Corrected } from "./corrected.js";
import { diagnostics } from "./diagnostic.js";
import { vue12349Exact } from "./vue-exact.js";

export const workloads: readonly WorkloadDefinition[] = [
  ...vue12349Exact,
  ...vue12349Corrected,
  ...diagnostics,
];

const byId = new Map(workloads.map((workload) => [workload.id, workload]));

export function getWorkload(id: string): WorkloadDefinition {
  const workload = byId.get(id);
  if (workload === undefined) throw new Error(`Unknown workload: ${id}`);
  return workload;
}

export function getSuite(suite: SuiteName): readonly WorkloadDefinition[] {
  return workloads.filter((workload) => workload.suite === suite);
}
