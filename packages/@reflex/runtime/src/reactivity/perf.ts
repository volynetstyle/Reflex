export interface RuntimePerfCounters {
  cleanupPassCount: number;
  cleanupStaleEdgeCount: number;
  trackReadCalls: number;
  trackReadDisposedSkip: number;
  trackReadDuplicateSourceHit: number;
  trackReadExpectedEdgeHit: number;
  trackReadFallbackScan: number;
  trackReadNewEdge: number;
  trackReadReorder: number;
  trackReadWhileActive: number;
}

export let runtimePerfCounters: RuntimePerfCounters | null = null;

export function createRuntimePerfCounters(): RuntimePerfCounters {
  return {
    cleanupPassCount: 0,
    cleanupStaleEdgeCount: 0,
    trackReadCalls: 0,
    trackReadDisposedSkip: 0,
    trackReadDuplicateSourceHit: 0,
    trackReadExpectedEdgeHit: 0,
    trackReadFallbackScan: 0,
    trackReadNewEdge: 0,
    trackReadReorder: 0,
    trackReadWhileActive: 0,
  };
}

export function setRuntimePerfCounters(
  counters: RuntimePerfCounters | null,
): RuntimePerfCounters | null {
  const previous = runtimePerfCounters;
  runtimePerfCounters = counters;
  return previous;
}
