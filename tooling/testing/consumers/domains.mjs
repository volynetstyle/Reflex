// Installed-package qualification for execution domains (PR-08/PR-10).
// Runs against tarballs in production and development conditions.
import assert from "node:assert/strict";
import * as core from "@volynets/reflex-runtime";
import * as internal from "@volynets/reflex-runtime/internal";
import { createSchedulerDomain } from "@volynets/reflex-scheduler";
import {
  bindManaged,
  createManagedRoot,
  createOwnedEffect,
  createPort,
} from "@volynets/reflex-framework";
import { createRuntime } from "@volynets/reflex";
import { asyncDerived, AsyncDisposedError } from "@volynets/reflex-async";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// One kernel and one domain registry across public and internal entries.
assert.equal(core.createExecutionDomain, internal.createExecutionDomain);
const probe = core.createExecutionDomain();
assert.equal(internal.getExecutionDomain(probe.context), probe);
probe.close();

// Two scheduler domains keep their queues apart (S1).
const apps = ["a", "b"].map((name) => {
  const { domain } = createSchedulerDomain({ effectStrategy: "flush" });
  const root = createManagedRoot(domain);
  const source = domain.run(() => core.createProducer(0));
  const seen = [];
  root.run(() =>
    createOwnedEffect(root.owner, root.node, () => {
      seen.push([name, core.readProducer(source)]);
    }),
  );
  const write = root.run(() =>
    bindManaged((value) => core.writeProducer(source, value)),
  );
  return { name, domain, root, seen, write };
});
const [a, b] = apps;
b.domain.run(() => a.write(1));
assert.equal(b.domain.hasPending(), false);
assert.equal(a.domain.hasPending(), true);
a.domain.flush();
assert.deepEqual(a.seen, [
  ["a", 0],
  ["a", 1],
]);
assert.deepEqual(b.seen, [["b", 0]]);

// A port mirrors a value into another domain without a reactive edge (P1).
const port = createPort(a.root, b.root);
a.root.run(() => port.publish({ x: 1, y: 2 }));
assert.equal(port.local.payload, undefined);
await tick();
assert.deepEqual(
  b.domain.run(() => core.readProducer(port.local)),
  {
    x: 1,
    y: 2,
  },
);
port.close();

// Closing a domain revokes async commit authority (L1).
const request = core.createExecutionDomain();
let settle;
const pending = request.run(() =>
  asyncDerived(() => new Promise((resolve) => (settle = resolve))),
);
request.close();
settle(1);
await tick();
assert.equal(pending.commit(), undefined);
assert.throws(() => pending.read(), AsyncDisposedError);

for (const app of apps) app.root.dispose();
assert.equal(a.domain.closed && b.domain.closed, true);

// The facade runtime is a domain too.
const runtime = createRuntime();
assert.equal(runtime.domain.context, runtime.ctx.execution);

console.log("Installed execution domain qualification passed.");
