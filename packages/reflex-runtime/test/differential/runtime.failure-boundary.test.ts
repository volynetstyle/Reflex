import { beforeEach, describe, expect, it } from "vitest";
import {
  createConsumer,
  createProducer,
  createWatcher,
  currentConsumer,
  disposeWatcher,
  expectGraphIntegrity,
  expectNoSubscriber,
  expectSubscriber,
  readConsumer,
  readProducer,
  readRuntimePhase,
  resetRuntimeContext,
  runWatcher,
  writeProducer,
  type ReactiveNode,
} from "../runtime.test_utils";
import { contractBoundaries } from "./catalog/boundaries";
import { compare, defineProgram } from "./api";

/**
 * Kernel rules under arbitrary userspace failure (SEMANTIC_CONTRACT.md,
 * "Failure boundary"):
 *
 *   R1  failure cannot corrupt runtime state;
 *   R2  failure cannot erase committed reactive evidence;
 *   R3  failure does not create new reactive evidence.
 *
 * F18 is the R3 boundary: a computed read that throws is no observation, so a
 * repair of its cause alone does not re-enter the failed watcher. Recovery is
 * a new entry from outside, and once it succeeds the edge is ordinary.
 */
describe("failure boundary (R1-R3)", () => {
  beforeEach(() => {
    resetRuntimeContext();
  });

  function scenario() {
    const gate = createProducer(true);
    const n = createProducer(1);
    const c = createConsumer(() => {
      if (readProducer(gate)) throw new Error("boom");
      return readProducer(n);
    });
    const runs: number[] = [];
    const attach = () => createWatcher(() => void runs.push(readConsumer(c)));
    const nodes = (...extra: ReactiveNode[]) =>
      [gate, n, c, ...extra] as unknown as ReactiveNode[];
    return { gate, n, c, runs, attach, nodes };
  }

  it("keeps a failed first read out of the graph and recovers only on re-entry", () => {
    const { gate, n, c, runs, attach, nodes } = scenario();
    const w = attach();

    // 1. The first attempt throws.
    expect(() => runWatcher(w)).toThrow("boom");

    // 2. R1: registers restored, graph structurally valid.
    expect(currentConsumer).toBeNull();
    expect(readRuntimePhase()).toEqual({ phase: 0, depth: 0 });
    expectGraphIntegrity(nodes(w as unknown as ReactiveNode));

    // 3. R3: no uncommitted c -> w subscription.
    expectNoSubscriber(c as never, w as never);
    expect((w as unknown as ReactiveNode).firstIn).toBeNull();

    // 4. Repairing the cause alone does not run w.
    writeProducer(gate, false);
    runWatcher(w);
    expect(runs).toEqual([]);

    // 5. An explicit re-entry succeeds.
    disposeWatcher(w);
    const retry = attach();
    runWatcher(retry);
    expect(runs).toEqual([1]);

    // 6. The successful attempt commits c -> w.
    expectSubscriber(c as never, retry as never);
    expectGraphIntegrity(nodes(retry as unknown as ReactiveNode));

    // 7. Later changes wake it normally.
    writeProducer(n, 2);
    runWatcher(retry);
    expect(runs).toEqual([1, 2]);
  });

  it("R2: a failure does not erase the committed edge it failed through", () => {
    const { gate, n, c, runs, attach, nodes } = scenario();
    writeProducer(gate, false);
    const w = attach();
    runWatcher(w);
    expect(runs).toEqual([1]);

    writeProducer(gate, true);
    expect(() => runWatcher(w)).toThrow("boom");
    expect(currentConsumer).toBeNull();
    expectGraphIntegrity(nodes(w as unknown as ReactiveNode));
    expectSubscriber(c as never, w as never);

    // The committed observation of c survives: a repair that leaves c equal
    // is cut off (L3), one that changes it wakes w.
    writeProducer(gate, false);
    runWatcher(w);
    expect(runs).toEqual([1]);
    writeProducer(gate, true);
    expect(() => runWatcher(w)).toThrow("boom");
    writeProducer(n, 2);
    writeProducer(gate, false);
    runWatcher(w);
    expect(runs).toEqual([1, 2]);
  });

  for (const boundary of contractBoundaries) {
    it(`pins ${boundary.id}: spec and Reflex agree, the repair runs nothing`, () => {
      const result = compare(defineProgram(boundary.id, boundary.program));
      expect(result.equivalent).toBe(true);
      expect(result.expected.at(-1)).toEqual({ effects: [] });
      expect(result.expected.some((step) => step.error !== undefined)).toBe(
        true,
      );
    });
  }
});
