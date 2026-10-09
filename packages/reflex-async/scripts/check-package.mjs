import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Each format runs in its own process so module caches cannot hide a split runtime.
if (process.argv[2] === undefined) {
  for (const format of ["esm", "cjs"]) {
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), format],
      {
        stdio: "inherit",
        windowsHide: true,
      },
    );
    if (child.error) throw child.error;
    assert.equal(child.status, 0, `${format}: package contract failed`);
  }
} else {
  const format = process.argv[2];
  const require = createRequire(import.meta.url);
  const base =
    format === "cjs"
      ? require("@volynets/reflex")
      : await import("@volynets/reflex");
  const async =
    format === "cjs"
      ? require("@volynets/reflex-async")
      : await import("@volynets/reflex-async");
  assert.equal("asyncDerived" in base, false);
  const unstable =
    format === "cjs"
      ? require("@volynets/reflex/unstable")
      : await import("@volynets/reflex/unstable");
  assert.equal("asyncDerived" in unstable, false);
  assert.equal(typeof unstable.optimistic, "function");
  assert.equal(typeof unstable.transition, "function");
  const runtime = base.createRuntime();
  const id = base.signal(1);
  const source = async.asyncDerived(() => id());
  assert.equal(source.read(), 1);
  id.set(2);
  runtime.flush();
  assert.equal(
    source.read(),
    2,
    `${format}: facade and async share reactive execution`,
  );

  let complete;
  const task = new Promise((resolve) => {
    complete = resolve;
  });
  const deferred = async.asyncDerived(() => task);
  assert.throws(() => deferred.read(), async.AsyncBlocker);
  complete(3);
  assert.equal(await deferred.resolve(), 3);
  assert.equal(source.currentOrUndefined(), 2);
  const protocol = async.asyncDerived(async (execution) => {
    await Promise.resolve();
    return execution.commit(source);
  });
  await assert.rejects(protocol.resolve(), async.AsyncProtocolError);
  assert.throws(() => protocol.error(), async.AsyncProtocolError);
  protocol.dispose();
  deferred.dispose();
  source.dispose();
  console.log(
    `${format}: async package shares the facade runtime; settlement and protocol passed`,
  );
}
