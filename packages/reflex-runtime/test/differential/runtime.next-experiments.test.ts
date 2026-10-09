import { beforeEach, describe, expect, it } from "vitest";
import { resetRuntimeContext } from "../../src";
import { defineProgram, expr, op, type Expr, type Op } from "./api";
import { executeDifferential } from "./harness";

const sum = (ids: readonly string[]): Expr =>
  ids
    .slice(1)
    .reduce<Expr>(
      (left, id) => expr.add(left, expr.read(id)),
      expr.read(ids[0]!),
    );

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (suffix) => [item, ...suffix],
    ),
  );
}

function run(id: string, operations: Op[]): void {
  executeDifferential(defineProgram(id, operations).operations);
}

describe("next experiments / semantic differential controls", () => {
  beforeEach(resetRuntimeContext);

  it("keeps duplicate, reordered and replaced dependency reads equivalent", () => {
    for (const order of permutations(["a", "b", "c"])) {
      run(`tracking/${order.join("")}`, [
        op.signal("a", 1),
        op.signal("b", 2),
        op.signal("c", 3),
        op.signal("gate", true),
        op.computed(
          "selected",
          expr.when(
            expr.read("gate"),
            expr.add(sum(order), expr.read(order[0]!)),
            expr.add(expr.read("c"), expr.read("a")),
          ),
        ),
        op.watcher("watcher", expr.read("selected")),
        op.flush(),
        op.set("b", 4),
        op.read("selected"),
        op.flush(),
        op.set("gate", false),
        op.read("selected"),
        op.flush(),
        op.set("b", 5), // Detached branch must not wake the watcher.
        op.flush(),
        op.set("gate", true),
        op.read("selected"),
        op.flush(),
      ]);
    }
  });

  it("retries changed dependency layouts after a thrown computation", () => {
    for (const order of permutations(["a", "b", "c"])) {
      run(`tracking-retry/${order.join("")}`, [
        op.signal("a", 1),
        op.signal("b", 2),
        op.signal("c", 3),
        op.signal("fail", false),
        op.computed(
          "selected",
          expr.when(
            expr.read("fail"),
            expr.add(sum(order), expr.fail("retry")),
            sum([...order].reverse()),
          ),
        ),
        op.read("selected"),
        op.set("fail", true),
        op.read("selected"),
        op.set("b", 8),
        op.set("fail", false),
        op.read("selected"),
        op.set("a", 9),
        op.read("selected"),
      ]);
    }
  });

  it("coalesces repeated writes while preserving reads between them", () => {
    for (const writeOrder of permutations(["a", "b", "c"])) {
      run(`staged/${writeOrder.join("")}`, [
        op.signal("a", 0),
        op.signal("b", 0),
        op.signal("c", 0),
        op.computed("shared", sum(["a", "b", "c"])),
        ...Array.from({ length: 4 }, (_, index) =>
          op.watcher(`watcher${index}`, expr.read("shared")),
        ),
        op.flush(),
        ...writeOrder.map((id, index) => op.set(id, index + 1)),
        op.read("shared"),
        op.set(writeOrder[0]!, 10),
        op.flush(),
        op.set(writeOrder[0]!, 10), // Object.is no-op.
        op.flush(),
        op.set(writeOrder[1]!, 20),
        op.read("shared"),
        op.flush(),
      ]);
    }
  });

  it("preserves behavior across mixed producer, computed and watcher roles", () => {
    for (const width of [1, 2, 8, 32]) {
      const ids = Array.from({ length: width }, (_, index) => `source${index}`);
      run(`role-mix/${width}`, [
        ...ids.map((id, index) => op.signal(id, index)),
        op.computed("total", sum(ids)),
        op.computed("same", expr.multiply(expr.read("total"), expr.value(0))),
        op.watcher("totalWatcher", expr.read("total")),
        op.watcher("shieldedWatcher", expr.read("same")),
        op.flush(),
        op.set(ids[0]!, 100),
        op.flush(),
        op.set(ids[width - 1]!, 200),
        op.flush(),
      ]);
    }
  });

  it("keeps direct and shared fan-out equivalent across staged write widths", () => {
    for (const width of [1, 8, 32]) {
      for (const depth of [1, 3]) {
        const leaves = Array.from(
          { length: width },
          (_, index) => `leaf${index}`,
        );
        const operations: Op[] = [
          op.signal("source", 0),
          ...leaves.map((id) => op.computed(id, expr.read("source"))),
        ];
        let parent = "source";
        for (let level = 0; level < depth; level += 1) {
          const id = `chain${level}`;
          operations.push(op.computed(id, expr.read(parent)));
          parent = id;
        }
        operations.push(
          op.watcher("sharedWatcher", expr.read(parent)),
          ...leaves.map((id, index) =>
            op.watcher(`directWatcher${index}`, expr.read(id)),
          ),
          op.flush(),
          op.set("source", 1),
          op.set("source", 2),
          op.set("source", 3),
          op.flush(),
          op.set("source", 3),
          op.flush(),
          op.set("source", 4),
          op.read(parent),
          op.set("source", 5),
          op.flush(),
        );
        run(`fanout/${width}/${depth}`, operations);
      }
    }
  });
});
