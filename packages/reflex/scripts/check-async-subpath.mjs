import assert from "node:assert/strict";

for (const [format, extension] of [["esm", "js"], ["cjs", "cjs"], ["dev", "js"]]) {
  const baseModule = await import(`../dist/${format}/index.${extension}`);
  const asyncModule = await import(`../dist/${format}/unstable/index.${extension}`);
  const base = format === "cjs" ? baseModule.default : baseModule;
  const async = format === "cjs" ? asyncModule.default : asyncModule;
  const runtime = base.createRuntime();
  assert.equal(typeof base.batch, "function", `${format}: preserve the live batch export`);
  assert.equal(base.batch, async.batch, `${format}: both facades share live batch bindings`);
  assert.equal(base.batch(() => 7), 7);
  const id = base.signal(1);
  const source = async.asyncDerived(() => id());
  assert.equal(source.read(), 1);
  id.set(2);
  runtime.flush();
  assert.equal(source.read(), 2, `${format}: root and unstable must share reactive execution`);

  let complete;
  const task = new Promise((resolve) => { complete = resolve; });
  const deferred = async.asyncDerived(() => task);
  complete(3);
  assert.equal(await deferred.resolve(), 3);
  assert.equal(source.currentOrUndefined(), 2);
  assert.equal("current" in async, false);
  const protocol = async.asyncDerived(async (execution) => {
    await Promise.resolve();
    return execution.commit(source);
  });
  await assert.rejects(protocol.resolve(), async.AsyncProtocolError);
  assert.throws(() => protocol.error(), async.AsyncProtocolError);
  protocol.dispose();
  deferred.dispose();
  source.dispose();
  console.log(`${format}: async subpath and root share runtime; async settlement passed`);
}
