import { describe, expect, it } from "vitest";
import { enumerateBoundedPrograms } from "./bounded-exhaustive";
import { format, observationsEqual, SpecMachine } from "./harness";
import { SpecRuntime } from "./internal/machine/spec-runtime";
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
