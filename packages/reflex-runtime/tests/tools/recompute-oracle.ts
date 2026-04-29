import { expect } from "vitest";

export function createComputeCounter() {
  const counts = new Map<string, number>();

  return {
    count<T>(label: string, compute: () => T): () => T {
      return () => {
        counts.set(label, (counts.get(label) ?? 0) + 1);
        return compute();
      };
    },
    countOf(label: string): number {
      return counts.get(label) ?? 0;
    },
    labels(): string[] {
      return [...counts.keys()];
    },
    reset(): void {
      counts.clear();
    },
    expectNone(): void {
      expect(counts.size).toBe(0);
    },
    expectOnce(labels: string[]): void {
      expect(new Set(counts.keys())).toEqual(new Set(labels));

      for (const label of labels) {
        expect(counts.get(label)).toBe(1);
      }
    },
    expectOnly(expected: Record<string, number>): void {
      expect(Object.fromEntries(counts)).toEqual(expected);
    },
  };
}
