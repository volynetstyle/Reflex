import { describe, expect, it } from "vitest";
import { createApi } from "../src/adapters/index.js";
import { diagnostics, vue12349Corrected, vue12349Exact } from "../src/workloads/index.js";

describe("workload catalog", () => {
  it("contains the literal 35 Vue PR workloads", () => {
    expect(vue12349Exact).toHaveLength(35);
  });

  it("uses unique ids", () => {
    const all = [...vue12349Exact, ...vue12349Corrected, ...diagnostics];
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
  });

  it.each(["alien", "reflex"] as const)(
    "keeps diagnostic observable work live for %s",
    (framework) => {
      const definition = diagnostics.find(
        (item) => item.id === "rotating-dependencies/rotate-by-one",
      )!;
      const workload = definition.setup(createApi(framework), 10, "eager");
      const before = workload.counters();
      workload.run();
      const after = workload.counters();
      expect(after.effectRuns - before.effectRuns).toBe(1);
      expect(after.checksum).toBe(45);
      workload.dispose();
    },
  );
});
