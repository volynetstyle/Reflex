import { expect } from "vitest";
import type { ReactiveNode } from "../../src";
import { getActiveConsumer, getPropagationDepth } from "../../src";
import type { EventSummary } from "./trace-harness";
import {
  expectGraphIntegrity,
  expectIncomingEdges,
  expectIncomingPrefix,
  expectOutgoingEdges,
  expectSources,
  hasSubscriber,
  incomingSources,
  outgoingSubscribers,
} from "./graph-inspector";
import type { TestReactiveEdge } from "./graph-inspector";

export type GraphSubject =
  | Iterable<ReactiveNode>
  | {
      nodes: Iterable<ReactiveNode>;
    };

function graphNodes(subject: GraphSubject): ReactiveNode[] {
  if (Symbol.iterator in Object(subject)) {
    return Array.from(subject as Iterable<ReactiveNode>);
  }

  return Array.from((subject as { nodes: Iterable<ReactiveNode> }).nodes);
}

export function expectGraph(subject: GraphSubject) {
  const nodes = graphNodes(subject);

  return {
    toBeBidirectional(): void {
      expectGraphIntegrity(nodes);
    },
    toHaveNoDuplicateEdges(): void {
      for (const node of nodes) {
        expect(new Set(incomingSources(node)).size).toBe(
          incomingSources(node).length,
        );
        expect(new Set(outgoingSubscribers(node)).size).toBe(
          outgoingSubscribers(node).length,
        );
      }
    },
    toHaveSources(node: ReactiveNode, expected: ReactiveNode[]): void {
      expectSources(node, expected);
    },
    toHaveIncomingEdges(node: ReactiveNode, expected: TestReactiveEdge[]): void {
      expectIncomingEdges(node, expected);
    },
    toHaveIncomingPrefix(
      node: ReactiveNode,
      expected: TestReactiveEdge[],
    ): void {
      expectIncomingPrefix(node, expected);
    },
    toHaveOutgoingEdges(node: ReactiveNode, expected: TestReactiveEdge[]): void {
      expectOutgoingEdges(node, expected);
    },
    toHaveSubscriber(from: ReactiveNode, to: ReactiveNode): void {
      expect(hasSubscriber(from, to)).toBe(true);
    },
    toHaveNoSubscriber(from: ReactiveNode, to: ReactiveNode): void {
      expect(hasSubscriber(from, to)).toBe(false);
    },
  };
}

export function expectRuntime() {
  return {
    toBeSettled(): void {
      expect(getPropagationDepth()).toBe(0);
      expect(getActiveConsumer()).toBeNull();
    },
  };
}

export function expectTrace(trace: { summary(): EventSummary }) {
  const summary = trace.summary();

  return {
    toHaveSingleRecompute(label: string): void {
      expect(
        summary.recomputes.filter((entry) => entry.startsWith(`${label}:`)),
      ).toHaveLength(1);
    },
    toHaveRecomputedOnce(labels: string[]): void {
      const counts = new Map<string, number>();

      for (const entry of summary.recomputes) {
        const [label] = entry.split(":");
        counts.set(label!, (counts.get(label!) ?? 0) + 1);
      }

      expect(new Set(counts.keys())).toEqual(new Set(labels));

      for (const label of labels) {
        expect(counts.get(label)).toBe(1);
      }
    },
    toHaveRecomputed(labels: string[]): void {
      const actual = summary.recomputes.map((entry) => entry.split(":")[0]);
      expect(new Set(actual)).toEqual(new Set(labels));
    },
    toHaveTracked(expected: string[]): void {
      for (const item of expected) {
        expect(summary.trackReads).toContain(item);
      }
    },
    toHaveNoStaleCleanup(): void {
      expect(summary.staleCleanups).toEqual([]);
    },
  };
}
