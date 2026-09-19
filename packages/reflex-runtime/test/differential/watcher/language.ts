import { defineCase, expr, op, type Expr, type Op } from "../api";
import type { DependencyId, WatcherEvidenceCase, WriteId } from "./cases";
import { Evidence, joinEvidence } from "./model";

const faultModel = "watcher-validation-obligation-lost-after-direct-change";

export const watcherEvidenceCases: readonly WatcherEvidenceCase[] = [
  ...enumerateMixed2(),
  ...enumerateMixed3(),
];

function enumerateMixed2(): WatcherEvidenceCase[] {
  const cases: WatcherEvidenceCase[] = [];

  for (const readOrder of permutations<DependencyId>(["direct", "failing"])) {
    for (const writeOrder of permutations<WriteId>(["direct", "failing"])) {
      cases.push(
        createCase({
          topology: "mixed-2",
          readOrder,
          writeOrder,
          setup: [
            op.signal("direct", 0),
            op.signal("failGate", false),
            op.computed(
              "failing",
              expr.when(
                expr.read("failGate"),
                expr.fail("validation failure"),
                expr.value(0),
              ),
            ),
          ],
          writes: {
            direct: op.set("direct", 1),
            failing: op.set("failGate", true),
          },
        }),
      );
    }
  }

  return cases;
}

function enumerateMixed3(): WatcherEvidenceCase[] {
  const cases: WatcherEvidenceCase[] = [];

  for (const readOrder of permutations<DependencyId>([
    "direct",
    "stableDerived",
    "failing",
  ])) {
    for (const writeOrder of permutations<WriteId>([
      "direct",
      "stable",
      "failing",
    ])) {
      cases.push(
        createCase({
          topology: "mixed-3",
          readOrder,
          writeOrder,
          setup: [
            op.signal("direct", 0),
            op.signal("stableSource", 0),
            op.signal("failGate", false),
            op.computed(
              "stableDerived",
              expr.multiply(expr.read("stableSource"), expr.value(0)),
            ),
            op.computed(
              "failing",
              expr.when(
                expr.read("failGate"),
                expr.fail("validation failure"),
                expr.value(0),
              ),
            ),
          ],
          writes: {
            direct: op.set("direct", 1),
            stable: op.set("stableSource", 1),
            failing: op.set("failGate", true),
          },
        }),
      );
    }
  }

  return cases;
}

interface CaseInput {
  readonly topology: WatcherEvidenceCase["topology"];
  readonly readOrder: readonly DependencyId[];
  readonly writeOrder: readonly WriteId[];
  readonly setup: readonly Op[];
  readonly writes: Readonly<Partial<Record<WriteId, Op>>>;
}

function createCase(input: CaseInput): WatcherEvidenceCase {
  const id =
    input.topology +
    "/read-" +
    input.readOrder.join("-") +
    "/write-" +
    input.writeOrder.join("-");
  const incomingEvidence = input.writeOrder.map(evidenceForWrite);
  const expectedEvidence = incomingEvidence.reduce(joinEvidence, Evidence.None);
  const differentialCase = defineCase({
    id,
    family: "watcher-evidence",
    faultModel,
    operations: [
      ...input.setup,
      op.watcher("watcher", expressionForReadOrder(input.readOrder), {
        cleanup: expr.value("cleanup"),
      }),
      op.flush(),
      ...input.writeOrder.map((write) => input.writes[write]!),
      op.flush(),
    ],
  });

  return {
    ...differentialCase,
    topology: input.topology,
    readOrder: input.readOrder,
    writeOrder: input.writeOrder,
    incomingEvidence,
    expectedEvidence,
  };
}

function evidenceForWrite(write: WriteId): Evidence {
  return write === "direct" ? Evidence.Changed : Evidence.Unknown;
}

function expressionForReadOrder(ids: readonly DependencyId[]): Expr {
  let expression: Expr = expr.read(ids[0]!);

  for (let index = 1; index < ids.length; index += 1) {
    expression = expr.add(expression, expr.read(ids[index]!));
  }

  return expression;
}

export function permutations<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];

  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (suffix) => [item, ...suffix],
    ),
  );
}
