import { execFileSync } from "node:child_process";

const check = `
  assert.equal(core.createProducer, internal.createProducer);
  assert.equal(core.readProducer, internal.readProducer);
  assert.equal(core.getActiveRuntimeContext, internal.getActiveRuntimeContext);
  const outer = core.getActiveRuntimeContext();
  const context = core.createRuntimeContext();
  core.runWithRuntimeContext(context, () => {
    assert.equal(internal.getActiveRuntimeContext(), context);
    const consumer = core.createConsumer(() => {
      assert.notEqual(internal.currentConsumer, null);
      return 42;
    });
    assert.equal(core.readConsumer(consumer), 42);
    assert.equal(internal.currentConsumer, null);
  });
  assert.equal(internal.getActiveRuntimeContext(), outer);
`;
for (const development of [false, true]) {
  const source =
    'import assert from "node:assert/strict"; import * as core from "@volynets/reflex-runtime"; import * as internal from "@volynets/reflex-runtime/internal";' +
    check;
  execFileSync(
    process.execPath,
    [
      ...(development ? ["--conditions=development"] : []),
      "--input-type=module",
      "-e",
      source,
    ],
    { cwd: new URL("../", import.meta.url), stdio: "pipe" },
  );
}
execFileSync(
  process.execPath,
  [
    "-e",
    'const assert = require("node:assert/strict"); const core = require("@volynets/reflex-runtime"); const internal = require("@volynets/reflex-runtime/internal");' +
      check,
  ],
  { cwd: new URL("../", import.meta.url), stdio: "pipe" },
);
console.log(
  "Runtime entrypoints share one kernel in production ESM, development ESM and CJS.",
);
