import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  analyzeFile,
  createInstrumentationPlan,
  type AlgorithmProjection,
} from "@volynets/algorithm-projection";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stagesRoot = join(runtimeRoot, "src", "kernel", "stages");
const tsconfig = join(runtimeRoot, "tsconfig.json");

interface StageFunction {
  file: string;
  name: string;
  node: ts.FunctionLikeDeclaration;
  source: ts.SourceFile;
}

function stageFunctions(directory = stagesRoot): StageFunction[] {
  const result: StageFunction[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...stageFunctions(path));
    else if (entry.name.endsWith(".ts") && entry.name !== "index.ts") {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (
          (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
          node.name
        )
          result.push({ file: path, name: node.name.text, node, source });
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return result;
}

function syntaxCounts(fn: StageFunction): {
  loops: number;
  branches: number;
  stateWrites: number;
} {
  let loops = 0,
    branches = 0,
    stateWrites = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isIfStatement(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "__PROFILE__" ||
        node.expression.text === "__DEV__") &&
      /\bobserveRuntime(?:Projection|Propagate|PushPath|PullPath|ReadConsumerPath)/u.test(
        node.thenStatement.getText(fn.source),
      )
    )
      return;
    if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    )
      loops++;
    if (
      ts.isIfStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isConditionalExpression(node)
    )
      branches++;
    if (
      ts.isBinaryExpression(node) &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === "state" &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      stateWrites++;
    ts.forEachChild(node, visit);
  };
  if (fn.node.body) visit(fn.node.body);
  return { loops, branches, stateWrites };
}

function project(file: string, name: string): AlgorithmProjection {
  return analyzeFile(join(stagesRoot, file), name, { tsconfig });
}

describe("Reflex stage projection", () => {
  it(
    "projects every named stage function with a self-contained CFG and matching syntax facts",
    { timeout: 30_000 },
    () => {
      const functions = stageFunctions();
      expect(functions).toHaveLength(26);
      for (const fn of functions) {
        const projection = analyzeFile(fn.file, fn.name, { tsconfig });
        const expected = syntaxCounts(fn);
        expect(
          projection.loops.length,
          `${relative(stagesRoot, fn.file)}:${fn.name} loops`,
        ).toBe(expected.loops);
        expect(
          projection.branches.length,
          `${relative(stagesRoot, fn.file)}:${fn.name} branches`,
        ).toBe(expected.branches);
        expect(
          projection.stateTransitions.length,
          `${relative(stagesRoot, fn.file)}:${fn.name} state writes`,
        ).toBe(expected.stateWrites);
        const plan = createInstrumentationPlan(projection);
        const pointIds = new Set(plan.points.map((point) => point.id));
        expect(pointIds.size, `${fn.name} observation point IDs`).toBe(
          plan.points.length,
        );
        expect(plan.points.every((point) => point.function === fn.name)).toBe(
          true,
        );
        expect(
          plan.points.length,
          `${fn.name} instrumentation plan completeness`,
        ).toBe(
          1 +
            projection.cfg.exits.length +
            projection.loops.length * 2 +
            projection.branches.length * 2 +
            projection.stateTransitions.length +
            projection.structures.stackCandidates.length * 2,
        );

        const ids = new Set(projection.cfg.nodes.map((node) => node.id));
        expect(ids.has(projection.cfg.entry), `${fn.name} CFG entry`).toBe(
          true,
        );
        for (const exit of projection.cfg.exits)
          expect(ids.has(exit), `${fn.name} CFG exit`).toBe(true);
        for (const node of projection.cfg.nodes)
          for (const adjacent of [...node.next, ...node.previous])
            expect(
              ids.has(adjacent),
              `${fn.name} CFG edge ${node.id} -> ${adjacent}`,
            ).toBe(true);
      }
    },
  );

  it(
    "matches the push, push-once, pull and advance flow landmarks",
    { timeout: 30_000 },
    () => {
      const push = project("first/push_iterator.ts", "pushIteratorCore");
      expect(push.loops.map((loop) => loop.condition)).toEqual([
        "edge !== null",
        "top !== base",
        "edge !== null",
      ]);
      expect(push.structures.linkedTraversals).toEqual([
        expect.objectContaining({
          start: "firstOut",
          continuation: "edge.nextOut",
          termination: "edge === null",
        }),
      ]);
      expect(push.structures.stackCandidates).toEqual([
        expect.objectContaining({
          storage: "stack",
          index: "top",
          pushes: 2,
          pops: 1,
        }),
      ]);
      expect(push.stateTransitions.map((transition) => transition.to)).toEqual([
        "(state & ~Visited) | Changed",
        "(state & ~(Unknown | Visited)) | Changed",
        "(state & ~Visited) | Changed",
        "(state & ~Visited) | Unknown",
      ]);

      const once = project(
        "first/push_iterator_once.ts",
        "pushIteratorOnceCore",
      );
      expect(once.structures.linkedTraversals[0]).toEqual(
        expect.objectContaining({
          continuation: "current.nextOut",
          termination: "current === null",
        }),
      );

      const skipping = project(
        "first/push_iterator_once_skipping.ts",
        "pushIteratorOnceSkippingCore",
      );
      expect(
        skipping.structures.linkedTraversals.map((item) => item.termination),
      ).toEqual(["current === skip", "current === null"]);

      const pull = project("second/pull_iterator.ts", "pullIteratorCore");
      expect(pull.loops.map((loop) => loop.condition)).toEqual([
        "true",
        "sibling !== null",
        "top !== base",
        "top !== base",
        "top !== base",
      ]);
      expect(pull.structures.stackCandidates).toEqual([
        expect.objectContaining({
          storage: "stack",
          index: "top",
          pushes: 1,
          pops: 2,
        }),
      ]);
      expect(pull.stateTransitions.map((transition) => transition.to)).toEqual([
        "node.state & ~Unknown",
        "node.state & ~Unknown",
      ]);

      const advance = project("second/advance.ts", "advanceCore");
      expect(
        advance.stateTransitions.map((transition) => transition.to),
      ).toEqual([
        "(node.state & ~Visited) | Computing",
        "(computingState & ~(Computing | Unknown)) | Changed",
        "computingState & ~Computing",
        "computingState & ~(Computing | Both)",
        "computingState & ~(Computing | Both)",
      ]);
      expect(advance.cfg.exits).toHaveLength(3);

      const pushPlan = createInstrumentationPlan(push);
      expect(
        pushPlan.points.filter((point) => point.kind === "branch-outcome"),
      ).toHaveLength(48);
      expect(
        pushPlan.points.filter((point) => point.kind === "state-transition"),
      ).toHaveLength(4);
      expect(
        pushPlan.points.filter(
          (point) => point.kind === "stack-push" || point.kind === "stack-pop",
        ),
      ).toHaveLength(2);
      expect(
        pushPlan.points.filter((point) => point.kind === "function-exit"),
      ).toHaveLength(3);

      const advancePlan = createInstrumentationPlan(advance);
      expect(
        advancePlan.points.filter((point) => point.kind === "state-transition"),
      ).toHaveLength(5);
      expect(
        advancePlan.points.filter((point) => point.kind === "function-exit"),
      ).toHaveLength(3);
      expect(new Set(advancePlan.points.map((point) => point.id)).size).toBe(
        advancePlan.points.length,
      );
    },
  );
});
