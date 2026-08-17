import type { FrameworkName, Policy, SuiteName, WorkCounters } from "./types.js";

export interface WorkerRequest {
  framework: FrameworkName;
  workloadId: string;
  size: number;
  policy: Policy;
  warmup: number;
  iterations: number;
  samples: number;
}

export interface GcMetrics {
  minorCount: number;
  majorCount: number;
  totalPauseMs: number;
  maxPauseMs: number;
}

export interface WorkerResult extends WorkerRequest {
  suite: SuiteName;
  sourceGroup: string;
  processId: number;
  node: string;
  jitless: boolean;
  meanNs: number;
  p95Ns: number;
  p99Ns: number;
  opsPerSecond: number;
  heapDeltaBytesPerOp: number;
  retainedHeapBytesPerOp: number;
  rssAfterBytes: number;
  counters: WorkCounters;
  gc: GcMetrics;
}

export interface BenchmarkReport {
  schemaVersion: 1;
  generatedAt: string;
  node: string;
  isolatedBy: "process";
  results: WorkerResult[];
  equivalenceFailures: string[];
}
