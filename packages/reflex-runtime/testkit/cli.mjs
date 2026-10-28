#!/usr/bin/env node
// Reflex runtime testkit: one entry point for every test, oracle and check
// of @volynets/reflex-runtime. Principles and the command reference:
// testkit/README.md.
//
//   pnpm rt <command> [options]       (from packages/reflex-runtime)
//   node testkit/cli.mjs <command> [options]
import { parseArgs, renderOptions, UsageError } from "./lib/args.mjs";

const COMMANDS = {
  list: "suites, tiers, gates, program families, mutants, policies, variants",
  run: "run suites by id, layer or tier (smoke | ci | deep)",
  gate: "run the checks a change kind requires (docs/GUIDE.md)",
  diff: "compare two runtime builds over generated programs",
  replay: "re-run one program or counterexample and show the trace diff",
  mutate: "mutation analysis of the program oracle: kill matrix",
  audit: "cross-suite fault audit: every mutant against every suite",
  doctor: "environment and catalog inventory checks",
};

function usage() {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  return [
    "Reflex runtime testkit",
    "",
    "usage: pnpm rt <command> [options]      (pnpm rt <command> --help)",
    "",
    ...Object.entries(COMMANDS).map(
      ([name, summary]) => `  ${name.padEnd(width)}  ${summary}`,
    ),
    "",
    "examples:",
    "  pnpm rt run --tier smoke              fast pre-commit loop",
    "  pnpm rt run oracle --tier deep        oracle suites at deep budgets",
    "  pnpm rt gate refactor                 bundle identity against HEAD",
    "  pnpm rt diff --reference HEAD --policy representation --time 2m --jobs 4",
    "  pnpm rt replay --family hub --seed 42 --candidate HEAD",
    "  pnpm rt mutate --mutants hint-keep-on-unlink",
    "  pnpm rt audit --role holdout          which suites detect the holdout faults",
    "",
    "principles and reference: testkit/README.md",
  ].join("\n");
}

async function main(argv) {
  const [name, ...rest] = argv;
  if (
    name === undefined ||
    name === "help" ||
    name === "--help" ||
    name === "-h"
  ) {
    console.log(usage());
    return 0;
  }
  if (!(name in COMMANDS))
    throw new UsageError(`unknown command "${name}"\n\n${usage()}`);
  // The oracle modules are TypeScript, loaded without a build step.
  if (!process.features?.typescript)
    throw new UsageError(
      `Node ${process.version} cannot load the oracle's TypeScript modules; use Node >= 22.18 (type stripping).`,
    );
  const command = await import(
    new URL(`./commands/${name}.mjs`, import.meta.url).href
  );
  if (rest.includes("--help") || rest.includes("-h")) {
    console.log(
      [
        `pnpm rt ${name} ${command.synopsis ?? "[options]"}`,
        "",
        command.description ?? COMMANDS[name],
        "",
        "options:",
        renderOptions(command.options),
      ].join("\n"),
    );
    return 0;
  }
  const { values, positionals } = parseArgs(rest, command.options);
  return (await command.default(values, positionals)) ?? 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`rt: ${error.message}`);
    process.exitCode = 2;
  } else {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
