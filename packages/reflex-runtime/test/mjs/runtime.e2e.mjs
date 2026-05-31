import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const packageDir = resolve(testDir, "..", "..");
const contractUrl = pathToFileURL(
  resolve(testDir, "..", "tools", "oracles", "runtime-contract.mjs"),
).href;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const tempRoots = [];

/**
 * Run commands with a per-test npm cache so the packed-consumer flow stays
 * isolated from the workspace.
 */
function runCommand(command, args, cwd, cacheDir) {
  const env = {
    ...process.env,
    npm_config_cache: cacheDir,
  };

  delete env.npm_config_recursive;

  const options = {
    cwd,
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  };

  if (process.platform === "win32" && command.endsWith(".cmd")) {
    const quote = (value) =>
      /[\s"]/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
    const shellCommand = [command, ...args.map(quote)].join(" ");

    return execFileSync(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", shellCommand],
      options,
    );
  }

  return execFileSync(command, args, options);
}

function createTempRoot() {
  const tempRoot = mkdtempSync(join(packageDir, ".runtime-e2e-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}

function cleanupTempRoots() {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop();

    if (tempRoot) {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  }
}

function parseJsonOutput(output) {
  const trimmed = output.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const arrayMatch = trimmed.match(/(\[[\s\S]*\])\s*$/u);

    if (arrayMatch) {
      return JSON.parse(arrayMatch[1]);
    }

    const objectMatch = trimmed.match(/(\{[\s\S]*\})\s*$/u);

    if (objectMatch) {
      return JSON.parse(objectMatch[1]);
    }
  }

  throw new SyntaxError(
    `Unable to parse JSON from command output: ${trimmed.slice(0, 200)}`,
  );
}

/**
 * Pack the current workspace package the same way an external consumer would
 * receive it from npm.
 */
function packRuntime(tempRoot) {
  const cacheDir = join(tempRoot, ".npm-cache");
  const output = runCommand(
    npmCommand,
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      tempRoot,
    ],
    packageDir,
    cacheDir,
  );
  const [{ filename }] = parseJsonOutput(output);

  return join(tempRoot, filename);
}

function installPackedRuntime(tempRoot, tarballPath) {
  const cacheDir = join(tempRoot, ".npm-cache");
  const appDir = join(tempRoot, "consumer");

  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "runtime-e2e-consumer",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );

  runCommand(
    npmCommand,
    ["install", tarballPath, "--ignore-scripts", "--package-lock=false"],
    appDir,
    cacheDir,
  );

  return appDir;
}

/**
 * Generate a tiny consumer entrypoint that imports the packed runtime and runs
 * the shared portable contract suite against it.
 */
function createScenarioSource(importBlock, label, format) {
  if (format === "cjs") {
    return `${importBlock}

void (async () => {
  const {
    createReflexRuntimeContractAdapter,
    runRuntimeContractTests,
  } = await import("${contractUrl}");

  const adapter = createReflexRuntimeContractAdapter(runtime);
  const results = runRuntimeContractTests(adapter, { label: ${JSON.stringify(label)} });

  console.log(JSON.stringify(results));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
  }

  return `import {
  createReflexRuntimeContractAdapter,
  runRuntimeContractTests,
} from "${contractUrl}";

${importBlock}

const adapter = createReflexRuntimeContractAdapter(runtime);
const results = runRuntimeContractTests(adapter, { label: ${JSON.stringify(label)} });

console.log(JSON.stringify(results));
`;
}

function runScenario(appDir, filename, importBlock, label, format) {
  const cacheDir = join(appDir, ".npm-cache");
  writeFileSync(
    join(appDir, filename),
    createScenarioSource(importBlock, label, format),
  );

  const output = runCommand(process.execPath, [filename], appDir, cacheDir);

  return parseJsonOutput(output);
}

try {
  const tempRoot = createTempRoot();
  const tarballPath = packRuntime(tempRoot);
  const appDir = installPackedRuntime(tempRoot, tarballPath);

  const esm = runScenario(
    appDir,
    "scenario.mjs",
    'import * as publicRuntime from "@volynets/reflex-runtime";\nimport * as internalRuntime from "@volynets/reflex-runtime/internal";\nconst runtime = { ...publicRuntime, ...internalRuntime };',
    "esm",
    "esm",
  );
  const cjs = runScenario(
    appDir,
    "scenario.cjs",
    'const runtime = { ...require("@volynets/reflex-runtime"), ...require("@volynets/reflex-runtime/internal") };',
    "cjs",
    "cjs",
  );

  const expectedNames = [
    "computed values are lazy and cached until a dependency changes",
    "rapid successive writes expose the latest value",
    "dynamic dependencies unsubscribe from stale branches",
    "diamond graphs recompute each derived node at most once per read",
    "effects are scheduled once for a burst and observe flushed state",
    "disposed effects stop observing future writes",
  ];

  assert.deepStrictEqual(
    esm,
    expectedNames.map((name) => `esm: ${name}`),
  );
  assert.deepStrictEqual(
    cjs,
    expectedNames.map((name) => `cjs: ${name}`),
  );
} finally {
  cleanupTempRoots();
}
