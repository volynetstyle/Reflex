// Self-test of the testkit (suite self.testkit): the parts whose failure would
// silently weaken every other check. Run with `node --test testkit/testkit.selftest.mjs`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { parseArgs, parseDuration, UsageError } from "./lib/args.mjs";
import { execute } from "./lib/executor.mjs";
import { inventory } from "./lib/inventory.mjs";
import { instrument, PROBE, REACH_MARKER } from "./lib/mutation.mjs";
import { packageRoot } from "./lib/paths.mjs";
import { bundleHash, parseSide, recordedSideSpec } from "./lib/sides.mjs";
import { GATES, select, SUITES, TIERS } from "./registry.mjs";

const oracle = (file) =>
  import(pathToFileURL(path.join(packageRoot, "test/oracle", file)).href);

describe("catalog", () => {
  it("owns every test file exactly once, with existing owners and live budgets", () => {
    const { errors } = inventory();
    assert.deepEqual(errors, []);
  });

  it("puts every suite in known tiers and every gate on known suites", () => {
    for (const item of SUITES)
      for (const tier of item.tiers)
        assert.ok(tier in TIERS, `${item.id}: ${tier}`);
    for (const gate of Object.values(GATES))
      for (const id of gate.suites)
        assert.ok(
          SUITES.some((item) => item.id === id),
          id,
        );
  });

  it("orders tiers by inclusion: smoke ⊆ ci ⊆ deep", () => {
    const ids = (tier) => new Set(select([], tier).map((item) => item.id));
    const [smoke, ci, deep] = ["smoke", "ci", "deep"].map(ids);
    for (const id of smoke) assert.ok(ci.has(id), `${id} is smoke but not ci`);
    for (const id of ci) assert.ok(deep.has(id), `${id} is ci but not deep`);
  });

  it("selects by id, layer and prefix", () => {
    assert.deepEqual(
      select(["oracle.corpus"], "smoke").map((s) => s.id),
      ["oracle.corpus"],
    );
    assert.ok(select(["oracle"], "ci").every((s) => s.layer === "oracle"));
    assert.ok(select(["spec."], "ci").every((s) => s.id.startsWith("spec.")));
    assert.deepEqual(
      select(["static.bundle-identity"], "ci").map((s) => s.id),
      ["static.bundle-identity"],
    );
    assert.throws(() => select(["nothing"], "ci"));
  });

  it("keeps advisory suites out of correctness verdicts", async () => {
    // Only the characterization layer may be advisory, and it always is: a
    // pin of uncontracted behavior must never block a fix of it.
    for (const item of SUITES)
      assert.equal(
        item.advisory === true,
        item.layer === "characterization",
        item.id,
      );
    const steps = [
      {
        suites: ["a"],
        exe: process.execPath,
        args: ["-e", "process.exit(1)"],
        cwd: packageRoot,
        env: {},
        advisory: true,
      },
      {
        suites: ["b"],
        exe: process.execPath,
        args: ["-e", ""],
        cwd: packageRoot,
        env: {},
      },
    ];
    const outcome = await execute(steps);
    assert.equal(outcome.status, "passed");
    assert.deepEqual(
      outcome.steps.map((step) => step.status),
      ["changed", "passed"],
    );
  });
});

describe("arguments", () => {
  const options = {
    families: { type: "list", default: ["default"] },
    programs: { type: "number", min: 1, default: 10 },
    time: { type: "duration" },
    shrink: { type: "boolean", default: true },
    mutate: { type: "string", repeat: true },
  };

  it("parses every option type", () => {
    const { values, positionals } = parseArgs(
      [
        "x",
        "--families",
        "hub,swarm",
        "--programs=5",
        "--time",
        "2m",
        "--no-shrink",
        "--mutate",
        "a",
        "--mutate",
        "b",
      ],
      options,
    );
    assert.deepEqual(positionals, ["x"]);
    assert.deepEqual(values, {
      families: ["hub", "swarm"],
      programs: 5,
      time: 120_000,
      shrink: false,
      mutate: ["a", "b"],
    });
  });

  it("rejects unknown options and malformed values", () => {
    assert.throws(() => parseArgs(["--nope"], options), UsageError);
    assert.throws(() => parseArgs(["--programs", "many"], options), UsageError);
    assert.throws(() => parseArgs(["--programs"], options), UsageError);
    for (const args of [
      ["--programs", "0"],
      ["--programs", "-1"],
      ["--programs", "1.5"],
      ["--programs", "--shrink"],
      ["--families="],
      ["--shrink=maybe"],
    ])
      assert.throws(() => parseArgs(args, options), UsageError);
    assert.throws(() => parseDuration("soon"), UsageError);
    assert.throws(() => parseDuration("0s"), UsageError);
    assert.equal(parseDuration("1.5h"), 5_400_000);
    assert.equal(parseDuration("250ms"), 250);
  });
});

describe("sides", () => {
  it("parses bases and modifiers", () => {
    assert.deepEqual(parseSide("source"), {
      spec: "source",
      kind: "source",
      ref: "source",
      variants: [],
      mutants: [],
    });
    assert.deepEqual(
      parseSide("HEAD^+eager-detach+mutant:write-skip-equality"),
      {
        spec: "HEAD^+eager-detach+mutant:write-skip-equality",
        kind: "ref",
        ref: "HEAD^",
        variants: ["eager-detach"],
        mutants: ["write-skip-equality"],
      },
    );
    assert.equal(parseSide("bundle:a/runtime.mjs").kind, "bundle");
    assert.throws(() => parseSide("HEAD++x"), UsageError);
    assert.throws(() => parseSide(""), UsageError);
  });

  it("hashes bundle content, not the builder's temporary directory", () => {
    const at = (dir) =>
      Buffer.from(
        `// ${dir}/reflex-oracle-${Math.random().toString(36).slice(2)}/pkg/src/a.ts\nlet a = 1;\n`,
      );
    assert.equal(bundleHash(at("C:/Temp")), bundleHash(at("/tmp")));
    assert.notEqual(
      bundleHash(Buffer.from("let a = 1;")),
      bundleHash(Buffer.from("let a = 2;")),
    );
  });

  it("pins replay refs while retaining modifiers and working-tree sides", () => {
    const commit = "a".repeat(40);
    assert.equal(
      recordedSideSpec({ spec: "HEAD+eager-detach", commit }),
      `${commit}+eager-detach`,
    );
    assert.equal(
      recordedSideSpec({ spec: "source+mutant:x", commit: "working-tree" }),
      "source+mutant:x",
    );
    assert.equal(recordedSideSpec(undefined), undefined);
  });

  it("recognizes watcher self-invalidation through computed dependencies", async () => {
    const { selfInvalidates } = await oracle("program.ts");
    const spec = {
      host: "claim",
      producers: 2,
      consumers: [{ reads: [{ node: 0, mode: "lazy" }] }],
      watchers: [
        {
          reads: [{ node: 2, mode: "lazy" }],
          action: { kind: "write", producer: 0, delta: 1 },
          actionWhen: 0,
        },
      ],
    };
    assert.equal(selfInvalidates(spec), true);
    spec.watchers[0].action.producer = 1;
    assert.equal(selfInvalidates(spec), false);
  });
});

describe("program families and reduction", () => {
  it("generates deterministically per seed", async () => {
    const { families } = await oracle("families.ts");
    for (const family of Object.values(families))
      for (const seed of [1, 2, 4218])
        assert.deepEqual(
          family.generate(seed),
          family.generate(seed),
          `${family.id} ${seed}`,
        );
  });

  it("keeps the pinned default and hub distributions", async () => {
    const { families } = await oracle("families.ts");
    const program = await oracle("program.ts");
    for (const seed of [1, 7, 99]) {
      assert.deepEqual(
        families.default.generate(seed),
        program.generateProgram(seed),
      );
      assert.deepEqual(
        families.hub.generate(seed),
        program.generateHubProgram(seed),
      );
    }
  });

  it("swarm only removes features", async () => {
    const { generateSwarmProgram, swarmConfiguration } =
      await oracle("families.ts");
    const { programSize, generateProgram } = await oracle("program.ts");
    for (let seed = 1; seed <= 200; seed++) {
      const off = new Set(swarmConfiguration(seed));
      const swarm = generateSwarmProgram(seed);
      const json = JSON.stringify(swarm);
      if (off.has("epoch")) assert.ok(!json.includes('"kind":"epoch"'));
      if (off.has("batch")) assert.ok(!json.includes('"kind":"batch"'));
      if (off.has("throws")) assert.ok(!json.includes("throwWhen"));
      if (off.has("hook")) assert.equal(swarm.spec.hook, undefined);
      assert.ok(
        programSize(swarm) <=
          programSize(generateProgram(seed)) + 4 * swarm.ops.length,
      );
    }
  });

  it("removes nodes with every reference renumbered", async () => {
    const { removeNodes, nodeCount } = await oracle("reduce.ts");
    const { families } = await oracle("families.ts");
    for (let seed = 1; seed <= 100; seed++) {
      const program = families.hub.generate(seed);
      const total = nodeCount(program);
      const removed = new Set([1, Math.floor(total / 2), total - 1]);
      const reduced = removeNodes(program, removed);
      const limit = nodeCount(reduced);
      assert.equal(limit, total - removed.size);
      const watchers = reduced.spec.watchers.length;
      const visit = (value) => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (value === null || typeof value !== "object") return;
        if (typeof value.node === "number")
          assert.ok(value.node < limit, `node ${value.node} >= ${limit}`);
        if (typeof value.producer === "number")
          assert.ok(value.producer < reduced.spec.producers);
        if (typeof value.watcher === "number")
          assert.ok(value.watcher < watchers);
        Object.values(value).forEach(visit);
      };
      visit(reduced);
    }
  });

  it("minimizes to a smaller program that still fails", async () => {
    const { minimize, nodeCount } = await oracle("reduce.ts");
    const { families } = await oracle("families.ts");
    const program = families.hub.generate(3);
    // A synthetic failure: the program still writes producer 0.
    const fails = (p) =>
      JSON.stringify(p.ops).includes('"kind":"write","producer":0');
    assert.ok(fails(program));
    const minimal = minimize(program, fails, 2_000);
    assert.ok(fails(minimal));
    assert.ok(nodeCount(minimal) < nodeCount(program));
    assert.equal(minimal.ops.length, 1);
  });
});

describe("fault audit", () => {
  it("maps every oracle mutant to a known fault model", async () => {
    const { AUDIT_MUTANTS, inventoryErrors } = await oracle("faults.ts");
    const { MUTANTS } = await oracle("mutants.ts");
    assert.deepEqual(inventoryErrors(), []);
    for (const mutant of MUTANTS)
      assert.ok(
        AUDIT_MUTANTS.some(
          (m) => m.id === mutant.id && m.role === "development",
        ),
        mutant.id,
      );
  });

  it("applies every inventory mutant to the current sources", async () => {
    const { AUDIT_MUTANTS } = await oracle("faults.ts");
    for (const mutant of AUDIT_MUTANTS) {
      const source = readFileSync(path.join(packageRoot, mutant.file), "utf8");
      const { code, probed } = instrument(source, mutant);
      assert.notEqual(code, source, mutant.id);
      assert.ok(probed, `${mutant.id}: no position for the reach probe`);
    }
  });

  it("puts the reach probe only where a statement may start", () => {
    const mutation = (search, replace) => ({ file: "f.ts", search, replace });
    const probed = (code, search, replace = "y();") =>
      instrument(code, mutation(search, replace));
    assert.equal(probed("a();\nx();", "x();").probed, true);
    assert.equal(probed("{\n  // note\n  x();", "x();").probed, true);
    assert.equal(probed("if (a) x();", "x();").probed, false);
    assert.equal(probed("if (a) b();\nelse x();", "else x();").probed, false);
    const marked = probed("if (a) x();", "x();", `${REACH_MARKER}y();`);
    assert.equal(marked.probed, true);
    assert.equal(marked.code, `if (a) ${PROBE}y();`);
    // First occurrence, as the oracle bundle builder replaces.
    const twice = probed("x(); x();", "x();", "y();");
    assert.equal(twice.occurrences, 2);
    assert.ok(twice.code.endsWith(" x();"));
    assert.throws(() => probed("a();", "x();"));
  });

  it("finds the cheapest cover and nothing more", async () => {
    const { cheapestCover } = await import("./commands/audit.mjs");
    const kills = new Map([
      ["slow", new Set(["m1", "m2"])],
      ["a", new Set(["m1"])],
      ["b", new Set(["m2"])],
      ["none", new Set()],
    ]);
    const cost = (file) => ({ slow: 100, a: 1, b: 1, none: 1 })[file];
    assert.deepEqual(cheapestCover(new Set(["m1", "m2"]), kills, cost).sort(), [
      "a",
      "b",
    ]);
  });
});
