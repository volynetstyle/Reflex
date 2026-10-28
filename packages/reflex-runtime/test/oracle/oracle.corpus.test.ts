import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as candidateModule from "../../src/internal";
import { BASELINE_COMMIT, loadBaseline } from "./baseline";
import {
  interpret,
  type ObservationLevel,
  type Program,
  type RuntimeModule,
} from "./program";
import { judge, type AcceptedClass } from "./verdict";

/**
 * Regression corpus (./corpus, README there): every committed program is
 * replayed on the frozen baseline and the working tree under the oracle's
 * `baseline` policy. `agree` entries must not diverge; `diverge` entries
 * record an open difference and must still diverge, so a fix is noticed and
 * the entry moves to `agree`. Programs are minimized witnesses, so the whole
 * corpus replays in well under a second.
 */
interface Entry {
  id: string;
  expect: "agree" | "diverge";
  level: ObservationLevel;
  class?: AcceptedClass;
  invariants?: boolean;
  program: Program;
}

const directory = path.join(__dirname, "corpus");
const entries: [string, Entry][] = readdirSync(directory)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => [
    file,
    JSON.parse(readFileSync(path.join(directory, file), "utf8")) as Entry,
  ]);
const candidate = candidateModule as unknown as RuntimeModule;
let baseline: RuntimeModule;

beforeAll(async () => {
  baseline = await loadBaseline();
}, 120_000);

describe(`regression corpus against baseline ${BASELINE_COMMIT.slice(0, 12)}`, () => {
  it("is not empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("%s", (_file, entry) => {
    const verdict = judge(
      baseline,
      candidate,
      entry.program,
      entry.level,
      "baseline",
    );
    if (entry.expect === "agree")
      expect(
        ["identical", "accepted"],
        `replay: pnpm rt replay test/oracle/corpus/${entry.id}.json --policy baseline --reference baseline --candidate source`,
      ).toContain(verdict.kind);
    else
      expect(
        verdict.kind,
        "an open divergence no longer diverges: change the entry to `agree`",
      ).toBe("divergent");
    if (entry.class !== undefined)
      expect(verdict).toEqual({ kind: "accepted", class: entry.class });
    if (entry.invariants)
      expect(
        interpret(candidate, entry.program, "strict", {
          invariants: true,
        }).filter((event) => event.startsWith("invariant:")),
      ).toEqual([]);
  });

  it.each(["default-3339-strict", "default-4326-observable"])(
    "%s does not excuse a changed producer value",
    (id) => {
      const entry = entries.find(([, entry]) => entry.id === id)![1];
      const changed: RuntimeModule = {
        ...candidate,
        get currentConsumer() {
          return candidate.currentConsumer;
        },
        writeProducer(node, value) {
          candidate.writeProducer(node, Number(value) + 1);
        },
      };
      expect(
        judge(baseline, changed, entry.program, entry.level, "baseline").kind,
      ).toBe("divergent");
    },
  );

  it("keeps structural checks after a host hook aborts propagation", () => {
    const entry = entries.find(
      ([, entry]) => entry.id === "hook-aborted-wave",
    )![1];
    const broken: RuntimeModule = {
      ...candidate,
      get currentConsumer() {
        return candidate.currentConsumer;
      },
      writeProducer(node, value) {
        try {
          candidate.writeProducer(node, value);
        } finally {
          // Fault injection after the hook throws: only liveness may be waived.
          node.firstOut = null;
        }
      },
    };
    const trace = interpret(broken, entry.program, "strict", {
      invariants: true,
    });
    expect(trace).toContain("err:Error:c1");
    expect(
      trace.some((event) =>
        event.includes("incoming edge missing from source list"),
      ),
    ).toBe(true);
  });
});
