// Retention audit for execution domains (PR-10).
// Creates and closes domains with graphs, watchers and deferred teardown, then
// proves through WeakRefs that nothing reachable from a closed domain is
// retained by the kernel or the domain registry.
//
//   node --expose-gc perf/domain-retention/run.mjs [--rounds=200]
import assert from "node:assert/strict";
import {
  createConsumer,
  createExecutionDomain,
  createProducer,
  createWatcher,
  getActiveRuntimeContext,
  readConsumer,
  readProducer,
  runWatcher,
  writeProducer,
} from "@volynets/reflex-runtime";

if (typeof globalThis.gc !== "function") {
  throw new Error("Run with node --expose-gc.");
}

const rounds = Number(
  process.argv.find((arg) => arg.startsWith("--rounds="))?.slice(9) ?? 200,
);
const ambient = getActiveRuntimeContext();
const refs = [];

function round(index) {
  const queue = [];
  const domain = createExecutionDomain({
    scheduler: {
      onNodeInvalidated: (node) => queue.push(node),
      flush: () => {
        while (queue.length) runWatcher(queue.shift());
      },
      release: () => (queue.length = 0),
    },
  });
  const shared = createProducer(index);
  domain.run(() => {
    const source = createProducer(0);
    const computed = createConsumer(
      () => readProducer(source) + readProducer(shared),
    );
    const watcher = createWatcher(() => {
      readConsumer(computed);
      return () => {};
    });
    runWatcher(watcher);
    writeProducer(source, 1);
    domain.teardown(() => void readProducer(source));
    refs.push(new WeakRef(source), new WeakRef(computed), new WeakRef(watcher));
  });
  domain.flush();
  domain.batch(() => writeProducer(shared, index + 1));
  domain.close();
  refs.push(
    new WeakRef(domain),
    new WeakRef(domain.context),
    new WeakRef(shared),
  );
}

for (let index = 0; index < rounds; index++) round(index);

for (let attempt = 0; attempt < 10; attempt++) {
  globalThis.gc();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const retained = refs.filter((ref) => ref.deref() !== undefined).length;
assert.equal(getActiveRuntimeContext(), ambient, "ambient context changed");
assert.equal(
  retained,
  0,
  `${retained} of ${refs.length} objects reachable after closing ${rounds} domains`,
);
console.log(
  `Execution domain retention passed: ${refs.length} objects from ${rounds} closed domains collected.`,
);
