import { bench, describe } from "vitest";
import {
  createConsumer,
  createExecutionDomain,
  createProducer,
  readConsumer,
  readProducer,
  runWithRuntimeContext,
  writeProducer,
} from "../runtime.test_utils";

/**
 * Boundary cost cohort for execution domains (PR-10). Kernel hot paths are
 * unchanged (check:architecture); these measure only the managed boundary.
 */
const OPS = 1_000;
let sink = 0;

const a = createExecutionDomain();
const b = createExecutionDomain();
const source = a.run(() => createProducer(0));
const computed = a.run(() => createConsumer(() => readProducer(source) + 1));

function work(i: number): void {
  writeProducer(source, i);
  sink ^= readConsumer(computed);
}

describe("execution domain boundary", () => {
  bench("raw write+read, active context (baseline)", () => {
    a.run(() => {
      for (let i = 0; i < OPS; i++) work(i);
    });
  });

  bench("same-domain nested run per op", () => {
    a.run(() => {
      for (let i = 0; i < OPS; i++) a.run(() => work(i));
    });
  });

  bench("raw context switch per op (runWithRuntimeContext)", () => {
    b.run(() => {
      for (let i = 0; i < OPS; i++)
        runWithRuntimeContext(a.context, () => work(i));
    });
  });

  bench("domain switch per op (B -> A -> B)", () => {
    b.run(() => {
      for (let i = 0; i < OPS; i++) a.run(() => work(i));
    });
  });

  bench("batch per op", () => {
    for (let i = 0; i < OPS; i++) a.batch(() => work(i));
  });

  bench("deferred teardown per op", () => {
    a.run(() => {
      for (let i = 0; i < OPS; i++) a.teardown(() => void (sink ^= i));
    });
  });

  bench("create + close domain", () => {
    for (let i = 0; i < 100; i++) createExecutionDomain().close();
  });
});

export { sink };
