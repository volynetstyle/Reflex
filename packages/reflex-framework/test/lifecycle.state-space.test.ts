import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LifecycleHandle, LifecycleScope } from "../src/ownership";

type ModelNode = {
  parent: number | null;
  children: number[];
  cleanups: string[];
  disposed: boolean;
};

const operation = fc.record({
  kind: fc.constantFrom("own", "defer", "dispose", "dispose-symbol"),
  target: fc.integer({ min: 0, max: 7 }),
  argument: fc.integer({ min: 0, max: 7 }),
});

describe("lifecycle ownership state space", () => {
  it("matches a small lifetime model across mixed adoption and disposal traces", () => {
    fc.assert(
      fc.property(
        fc.array(operation, { minLength: 1, maxLength: 60 }),
        (steps) => {
          const actualEvents: string[] = [];
          const expectedEvents: string[] = [];
          const scopes = Array.from({ length: 4 }, () => new LifecycleScope());
          const handles = Array.from(
            { length: 4 },
            (_, index) =>
              new LifecycleHandle({
                [Symbol.dispose]() {
                  actualEvents.push(`handle:${index}`);
                },
              }),
          );
          const actual = [...scopes, ...handles];
          const model: ModelNode[] = Array.from({ length: 8 }, (_, index) => ({
            parent: null,
            children: [],
            cleanups: index < 4 ? [] : [`handle:${index - 4}`],
            disposed: false,
          }));

          function modelOwn(parentIndex: number, childIndex: number): void {
            const parent = model[parentIndex]!;
            const child = model[childIndex]!;
            if (
              parent.disposed ||
              child.disposed ||
              child.parent === parentIndex ||
              child.parent !== null
            ) {
              return;
            }
            for (
              let ancestor: number | null = parentIndex;
              ancestor !== null;
              ancestor = model[ancestor]!.parent
            ) {
              if (ancestor === childIndex) return;
            }
            child.parent = parentIndex;
            parent.children.unshift(childIndex);
          }

          function modelDispose(index: number): void {
            const node = model[index]!;
            if (node.disposed) return;
            for (const child of [...node.children]) modelDispose(child);
            node.disposed = true;
            for (const cleanup of [...node.cleanups].reverse()) {
              expectedEvents.push(cleanup);
            }
            node.cleanups.length = 0;
            if (node.parent !== null) {
              const siblings = model[node.parent]!.children;
              siblings.splice(siblings.indexOf(index), 1);
              node.parent = null;
            }
            node.children.length = 0;
          }

          function compare(): void {
            expect(actualEvents).toEqual(expectedEvents);
            for (let index = 0; index < actual.length; index++) {
              expect(actual[index]!.disposed).toBe(model[index]!.disposed);
              const parentIndex = model[index]!.parent;
              expect(actual[index]!.node.parent).toBe(
                parentIndex === null ? null : actual[parentIndex]!.node,
              );
            }
          }

          for (const [stepIndex, step] of steps.entries()) {
            const parentIndex = step.target % scopes.length;
            const childIndex = step.argument;
            switch (step.kind) {
              case "own":
                scopes[parentIndex]!.own(actual[childIndex]!);
                modelOwn(parentIndex, childIndex);
                break;
              case "defer": {
                const label = `defer:${stepIndex}`;
                scopes[parentIndex]!.defer(() => {
                  actualEvents.push(label);
                });
                if (!model[parentIndex]!.disposed) {
                  model[parentIndex]!.cleanups.push(label);
                }
                break;
              }
              case "dispose":
                actual[step.target]!.dispose();
                modelDispose(step.target);
                break;
              case "dispose-symbol":
                actual[step.target]![Symbol.dispose]();
                modelDispose(step.target);
                break;
            }
            compare();
          }

          for (let index = 0; index < actual.length; index++) {
            actual[index]!.dispose();
            modelDispose(index);
          }
          compare();
        },
      ),
      { seed: 0x1fe61, numRuns: 500 },
    );
  });
});
