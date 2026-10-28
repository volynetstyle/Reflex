import { describe, expect, it } from "vitest";
import { enumerateBoundedPrograms } from "./bounded-exhaustive";
import { expr, op } from "./api";
import { format, observationsEqual, SpecMachine, type Op } from "./harness";
import {
  SpecRuntime,
  type SpecRuntimeOptions,
} from "./internal/machine/spec-runtime";
import { mutationQualificationCorpus } from "./mutant/mutation-corpus";
import type { QualificationProgram } from "./mutant/mutation-qualification";
import { enumerateRecoveryPrograms } from "./recovery-exhaustive";

/**
 * The spec is trusted more than the kernel only if every optimization in it is
 * itself checked. The validation cache skips a computed's validation when no
 * producer changed since its last success; the direct model validates on every
 * read. Both must produce the same observation at every operation of every
 * program of the bounded, recovery and mutation corpora.
 */
function firstDisagreement(
  corpus: readonly QualificationProgram[],
): string | undefined {
  for (const { name, program } of corpus) {
    const cached = new SpecMachine(new SpecRuntime());
    const direct = new SpecMachine(new SpecRuntime({ validationCache: false }));

    for (let index = 0; index < program.length; index += 1) {
      const operation = program[index]!;
      const left = cached.execute(operation);
      const right = direct.execute(operation);

      if (!observationsEqual(left, right))
        return `${name} at ${index} ${format(operation)}: cached ${format(left)}, direct ${format(right)}`;
    }
  }

  return undefined;
}

describe("executable spec self-consistency", () => {
  it("agrees with and without the validation cache on the bounded language", () => {
    expect(firstDisagreement(enumerateBoundedPrograms())).toBeUndefined();
  });

  it("agrees with and without the validation cache on the recovery language and mutation corpus", () => {
    expect(
      firstDisagreement([
        ...enumerateRecoveryPrograms(),
        ...mutationQualificationCorpus,
      ]),
    ).toBeUndefined();
  });
});

describe("spec rule 4 (C4): a failed computed read is causal retry evidence", () => {
  const run = (operations: readonly Op[], options?: SpecRuntimeOptions) => {
    const machine = new SpecMachine(new SpecRuntime(options));
    return operations.map((operation) => machine.execute(operation));
  };
  const program: readonly Op[] = [
    op.signal("gate", true),
    op.signal("other", 0),
    op.computed(
      "c",
      expr.when(expr.read("gate"), expr.fail("boom"), expr.value(1)),
    ),
    op.watcher("w", expr.read("c")),
    op.flush(),
    op.flush(),
    op.set("other", 1),
    op.flush(),
    op.set("gate", false),
    op.flush(),
  ];

  it("keeps a plain flush and an unrelated write a no-op, then retries on repair", () => {
    const trace = run(program);
    expect(trace[4]?.error?.message).toBe("boom");
    expect(trace[5]).toEqual({ effects: [] });
    expect(trace[7]).toEqual({ effects: [] });
    expect(trace[9]).toEqual({
      effects: [{ effect: "w", phase: "run", value: 1 }],
    });
  });

  it("differs from the previous rule only at the repair", () => {
    const current = run(program);
    const previous = run(program, { failedReadEvidence: false });
    const differing = current
      .map((observation, index) =>
        observationsEqual(observation, previous[index]!) ? -1 : index,
      )
      .filter((index) => index !== -1);
    expect(differing).toEqual([9]);
  });
});
