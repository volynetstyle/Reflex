import { execFileSync } from "node:child_process";

const check = `
  assert.equal(internal.Unknown, 1);
  assert.equal(internal.Changed, 2);
  assert.equal(internal.Both, internal.Unknown | internal.Changed);
  assert.equal(internal.Both, 3);
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
  // Execution domains share the same registry and kernel through both entries.
  assert.equal(core.createExecutionDomain, internal.createExecutionDomain);
  const a = core.createExecutionDomain();
  const b = internal.createExecutionDomain();
  assert.equal(internal.getExecutionDomain(a.context), a);
  assert.equal(core.getExecutionDomain(b.context), b);
  a.run(() => {
    assert.equal(internal.getActiveExecutionDomain(), a);
    b.run(() => assert.equal(core.getActiveRuntimeContext(), b.context));
    assert.equal(internal.getActiveRuntimeContext(), a.context);
  });
  a.close();
  assert.equal(internal.getExecutionDomain(a.context).closed, true);
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
for (const development of [false, true]) {
  execFileSync(
    process.execPath,
    [
      ...(development ? ["--conditions=development"] : []),
      "-e",
      'const assert = require("node:assert/strict"); const core = require("@volynets/reflex-runtime"); const internal = require("@volynets/reflex-runtime/internal");' +
        check +
        (development
          ? 'assert.equal(typeof require("@volynets/reflex-runtime/debug").subtle.mcp, "function");'
          : ""),
    ],
    { cwd: new URL("../", import.meta.url), stdio: "pipe" },
  );
}

console.log(
  "Runtime entrypoints share one kernel in production/development ESM and production/development CJS.",
);
