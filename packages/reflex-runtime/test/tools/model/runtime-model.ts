import { expect } from "vitest";
import {
  currentConsumer,
  getPropagationScopeDepth,
  readConsumer,
  readProducer,
  writeProducer,
} from "../../../src/internal";
import type { ReactiveNode } from "../../../src/internal";
import { createConsumer, createProducer } from "../fixtures/node-factory";
import {
  expectGraphIntegrity,
  incomingSources,
  outgoingSubscribers,
} from "../graph/graph-inspector";

export type PatternModel = {
  selector: ReactiveNode<number>;
  sources: ReactiveNode<number>[];
  total: ReactiveNode<number>;
  nodes: ReactiveNode[];
  read(): number;
  rerun(patternIndex: number): number;
  expectPattern(pattern: number[]): void;
};

export type PatternScenario = {
  name: string;
  deps: number;
  patterns: number[][];
  steps?: number;
};

export function createPatternModel(
  patterns: number[][],
  pool = Math.max(...patterns.flat()) + 1,
): PatternModel {
  const selector = createProducer(0);
  const sources = Array.from({ length: pool }, (_, index) =>
    createProducer(index),
  );
  const total = createConsumer(() =>
    sumPattern(patterns[readProducer(selector)]!, sources),
  );
  const nodes = [selector, total, ...sources];

  return {
    selector,
    sources,
    total,
    nodes,
    read() {
      return readConsumer(total);
    },
    rerun(patternIndex) {
      writeProducer(selector, patternIndex);
      return readConsumer(total);
    },
    expectPattern(pattern) {
      expect(readConsumer(total)).toBe(sumIndexes(pattern));
      expect(incomingSources(total)).toEqual([
        selector,
        ...uniqueIndexes(pattern).map((index) => sources[index]!),
      ]);
      expectRuntimeSectionHealthy(nodes);
    },
  };
}

export function expectRuntimeSectionHealthy(
  nodes: Iterable<ReactiveNode>,
): void {
  const list = Array.from(nodes);

  expectGraphIntegrity(list);

  for (const node of list) {
    expect(new Set(incomingSources(node)).size).toBe(
      incomingSources(node).length,
    );
    expect(new Set(outgoingSubscribers(node)).size).toBe(
      outgoingSubscribers(node).length,
    );
  }

  expect(getPropagationScopeDepth()).toBe(0);
  expect(currentConsumer).toBeNull();
}

export function runPatternScenario(scenario: PatternScenario): void {
  const pool = scenario.deps * 2;
  const model = createPatternModel(scenario.patterns, pool);
  const steps = scenario.steps ?? scenario.patterns.length;

  model.expectPattern(scenario.patterns[0]!);

  for (let step = 1; step < steps; step += 1) {
    const pattern = scenario.patterns[step % scenario.patterns.length]!;
    model.rerun(step % scenario.patterns.length);
    model.expectPattern(pattern);
  }
}

export function rotatePatterns(deps: number, steps = deps): number[][] {
  return Array.from({ length: steps }, (_, step) =>
    Array.from({ length: deps }, (__, index) => (index + step) % deps),
  );
}

export function branchSwapPatterns(deps: number): number[][] {
  return [
    Array.from({ length: deps }, (_, index) => index),
    Array.from({ length: deps }, (_, index) => index + deps),
  ];
}

export function mixedChurnPatterns(deps: number, steps = deps): number[][] {
  const retained = Math.floor(deps * 0.7);
  const churned = deps - retained;

  return Array.from({ length: steps }, (_, step) => {
    const stable = Array.from(
      { length: retained },
      (__, index) => (index + step) % retained,
    );
    const moving = Array.from(
      { length: churned },
      (__, index) => retained + ((step * churned + index) % deps),
    );

    return interleave(stable, moving, step);
  });
}

export function interleave<T>(left: T[], right: T[], offset: number): T[] {
  const output: T[] = [];
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    if ((index + offset) % 3 === 0) {
      if (right[index] !== undefined) output.push(right[index]);
      if (left[index] !== undefined) output.push(left[index]);
    } else {
      if (left[index] !== undefined) output.push(left[index]);
      if (right[index] !== undefined) output.push(right[index]);
    }
  }

  return output;
}

function sumPattern(
  pattern: number[],
  sources: ReactiveNode<number>[],
): number {
  let total = 0;

  for (const sourceIndex of pattern) {
    total += readProducer(sources[sourceIndex]!);
  }

  return total;
}

function sumIndexes(pattern: number[]): number {
  let total = 0;

  for (const sourceIndex of pattern) {
    total += sourceIndex;
  }

  return total;
}

function uniqueIndexes(pattern: number[]): number[] {
  return [...new Set(pattern)];
}
