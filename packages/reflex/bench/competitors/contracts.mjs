import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createSession, FRAMEWORKS, FRAMEWORK_LABELS } from "./adapters.mjs";

function settle(api, fn) {
  api.batch(fn);
  api.flush();
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const CONTRACTS = [
  {
    id: "same-value-suppression",
    claim: "Equality semantics suppress semantically unchanged propagation.",
    expected: [1],
    run(api) {
      const source = api.signal(1);
      const seen = [];
      api.effect(() => seen.push(source.read()));
      settle(api, () => source.write(1));
      return seen;
    },
  },
  {
    id: "derived-equality-suppression",
    claim:
      "A changed source does not notify observers when its derived value remains equal.",
    expected: [0],
    run(api) {
      const source = api.signal(0);
      const parity = api.computed(() => source.read() & 1);
      const seen = [];
      api.effect(() => seen.push(parity.read()));
      settle(api, () => source.write(2));
      return seen;
    },
  },
  {
    id: "dynamic-dependency-cleanup",
    claim: "A branch switch unlinks the stale branch.",
    expected: [1, 10, 20],
    run(api) {
      const flag = api.signal(true);
      const left = api.signal(1);
      const right = api.signal(10);
      const selected = api.computed(() =>
        flag.read() ? left.read() : right.read(),
      );
      const seen = [];
      api.effect(() => seen.push(selected.read()));
      settle(api, () => flag.write(false));
      settle(api, () => left.write(2));
      settle(api, () => right.write(20));
      return seen;
    },
  },
  {
    id: "diamond-single-settle",
    claim: "A diamond sink observes one stabilized value per source change.",
    expected: [4, 7],
    run(api) {
      const source = api.signal(1);
      const left = api.computed(() => source.read() + 1);
      const right = api.computed(() => source.read() * 2);
      const root = api.computed(() => left.read() + right.read());
      const seen = [];
      api.effect(() => seen.push(root.read()));
      settle(api, () => source.write(2));
      return seen;
    },
  },
  {
    id: "public-batch-snapshot",
    claim: "The public transaction primitive hides intermediate snapshots.",
    expected: ["1:10", "2:20"],
    requires: "publicBatch",
    run(api) {
      const left = api.signal(1);
      const right = api.signal(10);
      const seen = [];
      api.effect(() => seen.push(`${left.read()}:${right.read()}`));
      settle(api, () => {
        left.write(2);
        right.write(20);
      });
      return seen;
    },
  },
  {
    id: "disposal-unlinks",
    claim: "A disposed observer never runs again.",
    expected: [0],
    run(api) {
      const source = api.signal(0);
      const seen = [];
      const dispose = api.effect(() => seen.push(source.read()));
      dispose();
      settle(api, () => source.write(1));
      return seen;
    },
  },
  {
    id: "failure-retry",
    claim: "A failed derived read can be retried after its inputs recover.",
    expected: [2, "boom", 4],
    run(api) {
      const source = api.signal(1);
      const failing = api.signal(false);
      const derived = api.computed(() => {
        if (failing.read()) throw new Error("boom");
        return source.read() * 2;
      });
      const seen = [derived.read()];
      settle(api, () => failing.write(true));
      try {
        derived.read();
      } catch (error) {
        seen.push(error instanceof Error ? error.message : String(error));
      }
      settle(api, () => {
        failing.write(false);
        source.write(2);
      });
      seen.push(derived.read());
      return seen;
    },
  },
  {
    id: "bounded-reentrancy",
    claim: "A self-invalidating observer reaches a deterministic fixed point.",
    expected: [0, 1, 2],
    requires: "reentrantEffectWrites",
    run(api) {
      const source = api.signal(0);
      const seen = [];
      api.effect(() => {
        const value = source.read();
        seen.push(value);
        if (value < 2) source.write(value + 1);
      });
      api.flush();
      return seen;
    },
  },
  {
    id: "observer-order-determinism",
    claim: "Equal causal traces preserve observer registration order.",
    expected: ["a0", "b0", "a1", "b1"],
    run(api) {
      const source = api.signal(0);
      const seen = [];
      api.effect(() => seen.push(`a${source.read()}`));
      api.effect(() => seen.push(`b${source.read()}`));
      settle(api, () => source.write(1));
      return seen;
    },
  },
  {
    id: "stale-branch-after-failure",
    claim: "A partial dependency frontier does not poison retry or cleanup.",
    expected: [1, "boom", 20, 30],
    run(api) {
      const chooseRight = api.signal(false);
      const shouldThrow = api.signal(false);
      const left = api.signal(1);
      const right = api.signal(10);
      const selected = api.computed(() => {
        const value = chooseRight.read() ? right.read() : left.read();
        if (shouldThrow.read()) throw new Error("boom");
        return value;
      });
      const seen = [selected.read()];
      settle(api, () => {
        chooseRight.write(true);
        shouldThrow.write(true);
      });
      try {
        selected.read();
      } catch (error) {
        seen.push(error instanceof Error ? error.message : String(error));
      }
      settle(api, () => {
        shouldThrow.write(false);
        right.write(20);
      });
      seen.push(selected.read());
      settle(api, () => left.write(2));
      seen.push(selected.read());
      settle(api, () => right.write(30));
      seen[seen.length - 1] = selected.read();
      return seen;
    },
  },
];

function values(value) {
  return value?.split(",").filter(Boolean) ?? [];
}

function readOption(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function runContract(framework, contract) {
  let session;
  try {
    session = createSession(framework, (api) => ({
      observed: contract.run(api),
    }));
    session.api.flush();
    const observed = session.instance.observed;
    const unsupported =
      contract.requires !== undefined &&
      session.api.capabilities[contract.requires] !== true;
    return {
      framework,
      contract: contract.id,
      claim: contract.claim,
      status: unsupported
        ? "unsupported"
        : same(observed, contract.expected)
          ? "pass"
          : "fail",
      expected: contract.expected,
      observed,
      note: unsupported
        ? `No public ${contract.requires} capability; the observed trace is retained.`
        : undefined,
    };
  } catch (error) {
    return {
      framework,
      contract: contract.id,
      claim: contract.claim,
      status: "error",
      expected: contract.expected,
      error:
        error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
  } finally {
    try {
      session?.dispose();
    } catch {}
  }
}

function markdown(report) {
  const lines = [
    "# Cross-runtime semantic contracts",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Contract | " +
      report.frameworks.map((name) => FRAMEWORK_LABELS[name]).join(" | ") +
      " |",
    "|---|" + report.frameworks.map(() => "---").join("|") + "|",
  ];
  for (const contract of CONTRACTS) {
    const cells = report.frameworks.map((framework) => {
      const result = report.results.find(
        (item) => item.framework === framework && item.contract === contract.id,
      );
      return result?.status ?? "missing";
    });
    lines.push(`| ${contract.id} | ${cells.join(" | ")} |`);
  }
  lines.push(
    "",
    "`unsupported` is a capability result, not a benchmark failure. Inspect the JSON report for expected and observed traces.",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const selected = values(readOption(argv, "--framework"));
  const frameworks = selected.length ? selected : FRAMEWORKS;
  const results = frameworks.flatMap((framework) =>
    CONTRACTS.map((contract) => runContract(framework, contract)),
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    node: process.version,
    frameworks,
    results,
  };
  const output = readOption(argv, "--output");
  if (output) {
    const jsonPath = resolve(output);
    const markdownPath = /\.json$/i.test(jsonPath)
      ? jsonPath.replace(/\.json$/i, ".md")
      : `${jsonPath}.md`;
    await mkdir(dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, markdown(report), "utf8");
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  const failures = results.filter(
    (result) => result.status === "fail" || result.status === "error",
  );
  if (failures.length > 0) process.exitCode = 1;
}

await main();
