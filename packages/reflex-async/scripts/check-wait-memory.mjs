import assert from "node:assert/strict";
import { resolve } from "node:path";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { createRuntime } from "@volynets/reflex";

assert.equal(typeof globalThis.gc, "function", "Run with node --expose-gc.");
const bundle = process.argv[2] ?? "../dist/esm/index.js";
const { asyncDerived, until } = await import(
  process.argv[2] === undefined ? new URL(bundle, import.meta.url) : pathToFileURL(resolve(bundle)),
);
createRuntime();

// Keep the source and its notification reachable while probing cancelled
// waiter signals. Collection must not depend on settlement or disposal.
const source = asyncDerived(() => new Promise(() => {}));
const child = asyncDerived(({ read }) => read(source));

async function cancelledSignals(method, target) {
  const signals = [];
  for (let i = 0; i < 256; ++i) {
    const controller = new AbortController();
    signals.push(new WeakRef(controller.signal));
    const waiter = method === "resolve"
      ? target.resolve({ signal: controller.signal })
      : until(target, { signal: controller.signal });
    controller.abort();
    await waiter.catch(() => {});
  }
  return signals;
}

try {
  for (const [label, method, target] of [
    ["resolve", "resolve", source],
    ["until", "until", source],
    ["nested resolve", "resolve", child],
  ]) {
    const signals = await cancelledSignals(method, target);
    // WeakRef targets are retained until the end of the current job. Start
    // separate jobs before GC and before each observation.
    for (let round = 0; round < 8; ++round) {
      await setImmediate();
      globalThis.gc();
    }
    const retained = signals.filter((signal) => signal.deref() !== undefined).length;
    assert.equal(retained, 0, `${label}: cancelled waiter signals retained by a live pending source`);
    assert.equal(source.attempt().alive(), true);
    console.log(`${label}: collected all ${signals.length} cancelled waiter signals while the source stays pending`);
  }
} finally { child.dispose(); source.dispose(); }
