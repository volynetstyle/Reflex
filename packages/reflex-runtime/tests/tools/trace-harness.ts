import { expect } from "vitest";
import { subtle } from "../../src/debug";
import type { RuntimeDebugEvent } from "../../src/debug";
import { resetRuntime } from "./runtime-harness";

export type EventSummary = {
  byType: Record<string, number>;
  trackReads: string[];
  producerReads: string[];
  consumerReads: string[];
  recomputes: string[];
  propagations: string[];
  watcherInvalidations: string[];
  watcherRuns: string[];
  staleCleanups: string[];
};

function countByType(events: RuntimeDebugEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
  }

  return counts;
}

function labelOf(
  ref:
    | RuntimeDebugEvent["consumer"]
    | RuntimeDebugEvent["node"]
    | RuntimeDebugEvent["source"]
    | RuntimeDebugEvent["target"],
): string {
  return ref?.label ?? `#${ref?.id ?? "?"}`;
}

export function summarizeTrace(events: RuntimeDebugEvent[]): EventSummary {
  const trackReads: string[] = [];
  const producerReads: string[] = [];
  const consumerReads: string[] = [];
  const recomputes: string[] = [];
  const propagations: string[] = [];
  const watcherInvalidations: string[] = [];
  const watcherRuns: string[] = [];
  const staleCleanups: string[] = [];

  for (const event of events) {
    if (event.type === "track:read") {
      trackReads.push(`${labelOf(event.source)}->${labelOf(event.consumer)}`);
      continue;
    }

    if (event.type === "read:producer") {
      producerReads.push(`${labelOf(event.node)}@${labelOf(event.consumer)}`);
      continue;
    }

    if (event.type === "read:consumer") {
      const mode = String(event.detail?.mode ?? "?");
      consumerReads.push(
        `${labelOf(event.node)}:${mode}@${labelOf(event.consumer)}`,
      );
      continue;
    }

    if (event.type === "recompute") {
      const changed = event.detail?.changed === true ? "changed" : "stable";
      recomputes.push(`${labelOf(event.node)}:${changed}`);
      continue;
    }

    if (event.type === "propagate") {
      const immediate = event.detail?.immediate === true ? "!" : "~";
      propagations.push(
        `${labelOf(event.source)}-${immediate}>${labelOf(event.target)}`,
      );
      continue;
    }

    if (event.type === "watcher:invalidated") {
      watcherInvalidations.push(labelOf(event.node));
      continue;
    }

    if (
      event.type === "watcher:run:start" ||
      event.type === "watcher:run:finish" ||
      event.type === "watcher:run:skip"
    ) {
      watcherRuns.push(`${event.type}:${labelOf(event.node)}`);
      continue;
    }

    if (event.type === "cleanup:stale-sources") {
      const removedSources = Array.isArray(event.detail?.removedSources)
        ? event.detail.removedSources
            .map((ref) =>
              typeof ref === "object" && ref !== null && "label" in ref
                ? (ref.label ?? "#?") + ""
                : "#?",
            )
            .join(",")
        : "";

      staleCleanups.push(
        `${labelOf(event.node)}:${String(event.detail?.removedCount ?? 0)}:${removedSources}`,
      );
    }
  }

  return {
    byType: countByType(events),
    trackReads,
    producerReads,
    consumerReads,
    recomputes,
    propagations,
    watcherInvalidations,
    watcherRuns,
    staleCleanups,
  };
}

export function createTraceHarness(historyLimit = 1_000) {
  resetRuntime();
  subtle.configure({ historyLimit });

  return {
    label<T>(node: T, label: string): T {
      return subtle.label(node as never, label) as T;
    },
    clear() {
      subtle.clearHistory();
    },
    summary(): EventSummary {
      return summarizeTrace(subtle.history());
    },
    expectRecomputed(labels: string[]): void {
      expectTraceRecomputed(this.summary(), labels);
    },
    expectRecomputedOnce(labels: string[]): void {
      expectTraceRecomputedOnce(this.summary(), labels);
    },
    expectChanged(labels: string[]): void {
      expectTraceChanged(this.summary(), labels);
    },
    expectProducerReads(expected: string[]): void {
      expectTraceProducerReads(this.summary(), expected);
    },
    expectTracked(expected: string[]): void {
      expectTraceTracked(this.summary(), expected);
    },
    expectNoWatcherActivity(): void {
      expectNoWatcherActivity(this.summary());
    },
    expectNoStaleCleanup(): void {
      expectNoStaleCleanup(this.summary());
    },
    expectPropagationTargetsIncluded(expectedTargets: string[]): void {
      expectPropagationTargetsIncluded(this.summary(), expectedTargets);
    },
    expectPropagationTargetsVisitedOnce(expectedTargets: string[]): void {
      expectPropagationTargetsVisitedOnce(this.summary(), expectedTargets);
    },
  };
}

export function expectContainsAll(actual: string[], expected: string[]): void {
  for (const item of expected) {
    expect(actual).toContain(item);
  }
}

export function expectSetEqual(actual: string[], expected: string[]): void {
  expect(new Set(actual)).toEqual(new Set(expected));
}

export function expectTraceRecomputed(
  summary: EventSummary,
  labels: string[],
): void {
  const actual = summary.recomputes.map((entry) => entry.split(":")[0]);
  expectSetEqual(actual, labels);
}

export function expectTraceRecomputedOnce(
  summary: EventSummary,
  labels: string[],
): void {
  const counts = new Map<string, number>();

  for (const entry of summary.recomputes) {
    const [label] = entry.split(":");
    counts.set(label!, (counts.get(label!) ?? 0) + 1);
  }

  expect(new Set(counts.keys())).toEqual(new Set(labels));

  for (const label of labels) {
    expect(counts.get(label)).toBe(1);
  }
}

export function expectTraceChanged(
  summary: EventSummary,
  labels: string[],
): void {
  for (const label of labels) {
    expect(summary.recomputes).toContain(`${label}:changed`);
  }
}

export function expectTraceProducerReads(
  summary: EventSummary,
  expected: string[],
): void {
  expectSetEqual(summary.producerReads, expected);
}

export function expectTraceTracked(
  summary: EventSummary,
  expected: string[],
): void {
  expectContainsAll(summary.trackReads, expected);
}

export function expectNoWatcherActivity(summary: EventSummary): void {
  expect(summary.watcherInvalidations).toEqual([]);
  expect(summary.watcherRuns).toEqual([]);
}

export function expectNoStaleCleanup(summary: EventSummary): void {
  expect(summary.staleCleanups).toEqual([]);
}

export function expectPropagationTargetsIncluded(
  summary: EventSummary,
  expectedTargets: string[],
): void {
  const targets = summary.propagations.map((entry) => {
    const arrowIndex = entry.indexOf(">");
    return entry.slice(arrowIndex + 1);
  });

  for (const target of expectedTargets) {
    expect(targets).toContain(target);
  }
}

export function expectPropagationTargetsVisitedOnce(
  summary: EventSummary,
  expectedTargets: string[],
): void {
  const counts = new Map<string, number>();

  for (const entry of summary.propagations) {
    const arrowIndex = entry.indexOf(">");
    const target = entry.slice(arrowIndex + 1);
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }

  for (const target of expectedTargets) {
    expect(counts.get(target)).toBe(1);
  }
}
