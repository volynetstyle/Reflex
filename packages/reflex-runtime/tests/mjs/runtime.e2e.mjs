import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const packageDir = resolve(testDir, "..", "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const tempRoots = [];

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

function createScenarioSource(importBlock) {
  return `${importBlock}

const runtime = createExecutionContext();
setDefaultContext(runtime);

function createProducer(value) {
  return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
}

function createConsumer(compute) {
  return new ReactiveNode(undefined, compute, CONSUMER_INITIAL_STATE);
}

function createWatcher(compute) {
  return new ReactiveNode(null, compute, WATCHER_INITIAL_STATE);
}

runtime.resetState();

const pending = [];
let invalidations = 0;

runtime.setHooks({
  onSinkInvalidated(node) {
    invalidations += 1;

    if (!pending.includes(node)) {
      pending.push(node);
    }
  },
});

const flag = createProducer(true);
const left = createProducer(1);
const right = createProducer(10);
const selected = createConsumer(() =>
  readProducer(flag) ? readProducer(left) : readProducer(right),
);
const effectValues = [];
const cleanupValues = [];

const watcher = createWatcher(() => {
  const value = readConsumer(selected);
  effectValues.push(value);

  return () => {
    cleanupValues.push(value);
  };
});

runWatcher(watcher);

writeProducer(left, 2);
writeProducer(right, 99);
writeProducer(flag, false);

const queueBeforeFlush = pending.length;

while (pending.length > 0) {
  runWatcher(pending.shift());
}

const valueAfterFlush = readConsumer(selected);

writeProducer(left, 3);

const staleBranchQueue = pending.length;
const valueAfterStaleBranchWrite = readConsumer(selected);

writeProducer(right, 99);

const sameValueQueue = pending.length;

disposeWatcher(watcher);

const disposed = Boolean(watcher.state & ReactiveNodeState.Disposed);

writeProducer(right, 100);

const postDisposeQueue = pending.length;
const finalSelected = readConsumer(selected);

console.log(
  JSON.stringify({
    cleanupValues,
    disposed,
    effectValues,
    finalSelected,
    invalidations,
    postDisposeQueue,
    queueBeforeFlush,
    sameValueQueue,
    staleBranchQueue,
    valueAfterFlush,
    valueAfterStaleBranchWrite,
  }),
);
`;
}

function runScenario(appDir, filename, importBlock) {
  const cacheDir = join(appDir, ".npm-cache");
  writeFileSync(join(appDir, filename), createScenarioSource(importBlock));

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
    'import { CONSUMER_INITIAL_STATE, PRODUCER_INITIAL_STATE, ReactiveNode, ReactiveNodeState, WATCHER_INITIAL_STATE, createExecutionContext, disposeWatcher, readConsumer, readProducer, runWatcher, setDefaultContext, writeProducer } from "@reflex/runtime";',
  );
  const cjs = runScenario(
    appDir,
    "scenario.cjs",
    'const { CONSUMER_INITIAL_STATE, PRODUCER_INITIAL_STATE, ReactiveNode, ReactiveNodeState, WATCHER_INITIAL_STATE, createExecutionContext, disposeWatcher, readConsumer, readProducer, runWatcher, setDefaultContext, writeProducer } = require("@reflex/runtime");',
  );

  const expected = {
    cleanupValues: [1, 99],
    disposed: true,
    effectValues: [1, 99],
    finalSelected: 100,
    invalidations: 1,
    postDisposeQueue: 0,
    queueBeforeFlush: 1,
    sameValueQueue: 0,
    staleBranchQueue: 0,
    valueAfterFlush: 99,
    valueAfterStaleBranchWrite: 99,
  };

  assert.deepStrictEqual(esm, expected);
  assert.deepStrictEqual(cjs, expected);
} finally {
  cleanupTempRoots();
}
