import { expect } from "vitest";
import {
  readConsumer,
  readProducer,
  writeProducer,
} from "../../../src/internal";
import type { ReactiveNode } from "../../../src/internal";
import { createConsumer, createProducer } from "../fixtures/node-factory";
import { expectRuntimeSectionHealthy } from "./runtime-model";

export type ModelRow = {
  alive: boolean;
  group: number;
  order: number;
  value: number;
};

export type ModelOperation =
  | { type: "write"; row: number; value: number }
  | { type: "move"; row: number; order: number }
  | { type: "regroup"; row: number; group: number }
  | { type: "toggle"; row: number }
  | { type: "select"; group: number };

export type RecomputedSnapshot = {
  count: number;
  distinct: number;
  list: number[];
  max: number | null;
  min: number | null;
  sum: number;
};

type ReactiveRow = {
  alive: ReactiveNode<boolean>;
  group: ReactiveNode<number>;
  order: ReactiveNode<number>;
  value: ReactiveNode<number>;
};

/**
 * Differential model for cached incremental execution.
 *
 * The runtime keeps and invalidates a live graph, while the oracle derives the
 * same snapshot from plain current state on every step. Any stale dependency,
 * missed invalidation, bad branch cleanup, or incorrectly retained aggregate
 * therefore becomes an observable mismatch.
 */
export function createRecomputationModel(initialRows: ModelRow[]) {
  const state = initialRows.map((row) => ({ ...row }));
  const selectedGroup = createProducer(0);
  const rows: ReactiveRow[] = initialRows.map((row) => ({
    alive: createProducer(row.alive),
    group: createProducer(row.group),
    order: createProducer(row.order),
    value: createProducer(row.value),
  }));

  const selectedRows = createConsumer(() => {
    const group = readProducer(selectedGroup);
    const active: { index: number; order: number; value: number }[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      if (!readProducer(row.alive) || readProducer(row.group) !== group) {
        continue;
      }
      active.push({
        index,
        order: readProducer(row.order),
        value: readProducer(row.value),
      });
    }

    active.sort(
      (left, right) => left.order - right.order || left.index - right.index,
    );
    return active;
  });
  const count = createConsumer(() => readConsumer(selectedRows).length);
  const sum = createConsumer(() =>
    readConsumer(selectedRows).reduce((total, row) => total + row.value, 0),
  );
  const min = createConsumer(() => {
    const active = readConsumer(selectedRows);
    return active.length === 0
      ? null
      : active.reduce((result, row) => Math.min(result, row.value), Infinity);
  });
  const max = createConsumer(() => {
    const active = readConsumer(selectedRows);
    return active.length === 0
      ? null
      : active.reduce((result, row) => Math.max(result, row.value), -Infinity);
  });
  const list = createConsumer(() =>
    readConsumer(selectedRows).map((row) => row.value),
  );
  const distinct = createConsumer(
    () => new Set(readConsumer(selectedRows).map((row) => row.value)).size,
  );
  const snapshot = createConsumer<RecomputedSnapshot>(() => ({
    count: readConsumer(count),
    distinct: readConsumer(distinct),
    list: readConsumer(list),
    max: readConsumer(max),
    min: readConsumer(min),
    sum: readConsumer(sum),
  }));

  const nodes: ReactiveNode[] = [
    selectedGroup,
    ...rows.flatMap((row) => [row.alive, row.group, row.order, row.value]),
    selectedRows,
    count,
    sum,
    min,
    max,
    list,
    distinct,
    snapshot,
  ];

  function apply(operation: ModelOperation): void {
    if (operation.type === "select") {
      writeProducer(selectedGroup, operation.group);
      return;
    }

    const index = operation.row % rows.length;
    const reactive = rows[index]!;
    const plain = state[index]!;

    switch (operation.type) {
      case "write":
        plain.value = operation.value;
        writeProducer(reactive.value, operation.value);
        break;
      case "move":
        plain.order = operation.order;
        writeProducer(reactive.order, operation.order);
        break;
      case "regroup":
        plain.group = operation.group;
        writeProducer(reactive.group, operation.group);
        break;
      case "toggle":
        plain.alive = !plain.alive;
        writeProducer(reactive.alive, plain.alive);
        break;
    }
  }

  function recompute(): RecomputedSnapshot {
    const group = readProducer(selectedGroup);
    const active = state
      .map((row, index) => ({ ...row, index }))
      .filter((row) => row.alive && row.group === group)
      .sort(
        (left, right) => left.order - right.order || left.index - right.index,
      );
    const values = active.map((row) => row.value);

    return {
      count: values.length,
      distinct: new Set(values).size,
      list: values,
      max: values.length === 0 ? null : Math.max(...values),
      min: values.length === 0 ? null : Math.min(...values),
      sum: values.reduce((total, value) => total + value, 0),
    };
  }

  return {
    apply,
    assertEquivalent(): void {
      expect(readConsumer(snapshot)).toEqual(recompute());
      expectRuntimeSectionHealthy(nodes);
    },
  };
}
