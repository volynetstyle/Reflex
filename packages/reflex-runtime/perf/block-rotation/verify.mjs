import assert from "node:assert/strict";
import fs from "node:fs";
const results = [];
function permutations(a) {
  if (!a.length) return [[]];
  return a.flatMap((x, i) =>
    permutations(a.filter((_, j) => j !== i)).map((t) => [x, ...t]),
  );
}
function incoming(node) {
  const edges = [];
  let prev = null;
  for (let e = node.firstIn; e; e = e.nextIn) {
    assert.equal(e.prevIn, prev);
    assert.equal(e.to, node);
    assert(!edges.includes(e));
    edges.push(e);
    prev = e;
  }
  assert.equal(node.lastIn, prev);
  if (node.tailIn) assert(edges.includes(node.tailIn));
  return edges;
}
function integrity(nodes) {
  for (const n of nodes) {
    for (const e of incoming(n)) {
      let found = 0,
        prev = null;
      for (let out = e.from.firstOut; out; out = out.nextOut) {
        assert.equal(out.prevOut, prev);
        assert.equal(out.from, e.from);
        if (out === e) found++;
        prev = out;
      }
      assert.equal(e.from.lastOut, prev);
      assert.equal(found, 1);
    }
    let prev = null;
    for (let e = n.firstOut; e; e = e.nextOut) {
      assert.equal(e.prevOut, prev);
      assert(incoming(e.to).includes(e));
      prev = e;
    }
    assert.equal(n.lastOut, prev);
  }
}
for (const variant of ["move", "rotate"]) {
  const api = await import(`./results/${variant}-timing.mjs`),
    {
      createProducer,
      createConsumer,
      createWatcher,
      readProducer,
      readConsumer,
      writeProducer,
      runWatcher,
      disposeWatcher,
      untracked,
    } = api;
  let primitiveCases = 0,
    failureCases = 0,
    lifecycleCases = 0;
  for (let n = 3; n <= 8; n++)
    for (let cursor = 0; cursor < n - 2; cursor++)
      for (let gap = 1; gap <= 2 && cursor + gap + 1 < n; gap++) {
        const sources = Array.from({ length: n }, () => createProducer(1));
        const consumer = createConsumer(() =>
          sources.reduce((s, x) => s + readProducer(x), 0),
        );
        readConsumer(consumer);
        const other = createConsumer(() =>
          sources.reduce((s, x) => s + readProducer(x), 0),
        );
        readConsumer(other);
        const old = incoming(consumer),
          outgoing = sources.map((x) => [
            x.firstOut,
            x.lastOut,
            x.firstOut.nextOut,
            x.lastOut.prevOut,
          ]);
        consumer.tailIn = old[cursor];
        const requested = old[cursor + gap + 1];
        api.moveTrackedIncomingEdgeAfterCursorUnchecked(
          consumer,
          old[cursor],
          requested,
          77,
        );
        const expected = old.slice();
        if (variant === "rotate") {
          const skipped = expected.splice(cursor + 1, gap);
          expected.push(...skipped);
        } else {
          expected.splice(cursor + gap + 1, 1);
          expected.splice(cursor + 1, 0, requested);
        }
        assert.deepEqual(incoming(consumer), expected);
        assert.equal(consumer.tailIn, requested);
        assert.equal(requested.version, 77);
        sources.forEach((x, i) =>
          assert.deepEqual(
            [x.firstOut, x.lastOut, x.firstOut.nextOut, x.lastOut.prevOut],
            outgoing[i],
          ),
        );
        integrity([...sources, consumer, other]);
        primitiveCases++;
      }
  for (const order of permutations([0, 1, 2, 3, 4]))
    for (let stop = 1; stop <= 6; stop++)
      for (const differentRetry of [false, true]) {
        const sources = Array.from({ length: 5 }, () => createProducer(1)),
          tick = createProducer(0);
        let trace = [0, 1, 2, 3, 4],
          failAt = 0,
          reads = 0;
        const error = new Error("retry test");
        const consumer = createConsumer(() => {
          reads = 0;
          readProducer(tick);
          if (++reads === failAt) throw error;
          let sum = 0;
          for (const id of trace) {
            sum += readProducer(sources[id]);
            if (++reads === failAt) throw error;
          }
          return sum;
        });
        readConsumer(consumer);
        const original = incoming(consumer),
          sourceIds = new Map([[tick, -1], ...sources.map((s, i) => [s, i])]);
        trace = order;
        failAt = stop;
        writeProducer(tick, 1);
        assert.throws(
          () => readConsumer(consumer),
          (e) => e === error,
        );
        integrity([...sources, tick, consumer]);
        const partial = incoming(consumer);
        assert.equal(partial.length, original.length);
        assert(original.every((e) => partial.includes(e)));
        const observed = [-1, ...order].slice(0, stop);
        const tailIndex = partial.indexOf(consumer.tailIn);
        assert.deepEqual(
          partial.slice(0, tailIndex + 1).map((e) => sourceIds.get(e.from)),
          observed,
        );
        assert.equal(consumer.state & 8, 0);
        assert(consumer.state & 2);
        assert.equal(api.currentConsumer, null);
        assert.equal(api.runtimeState & 1, 0);
        failAt = 0;
        if (differentRetry) trace = order.slice(0, 3).reverse();
        assert.equal(readConsumer(consumer), trace.length);
        assert.deepEqual(
          incoming(consumer).map((e) => sourceIds.get(e.from)),
          [-1, ...trace],
        );
        integrity([...sources, tick, consumer]);
        failureCases++;
      }
  {
    const sources = Array.from({ length: 5 }, () => createProducer(1)),
      tick = createProducer(0);
    let phase = 0;
    const inner = createConsumer(() => readProducer(sources[4]));
    const outer = createConsumer(() => {
      readProducer(tick);
      const order = phase ? [1, 2, 3, 0] : [0, 1, 2, 3];
      let sum = 0;
      for (const i of order) {
        sum += readProducer(sources[i]);
        if (i === 1) {
          sum += readConsumer(inner);
          untracked(() => readProducer(sources[4]));
        }
      }
      return sum;
    });
    assert.equal(readConsumer(outer), 5);
    phase = 1;
    writeProducer(tick, 1);
    assert.equal(readConsumer(outer), 5);
    integrity([...sources, tick, inner, outer]);
    assert.equal(api.currentConsumer, null);
    lifecycleCases++;
  }
  {
    const [a, b, c, d] = Array.from({ length: 4 }, () => createProducer(0)),
      tick = createProducer(0);
    let phase = 0,
      unvisitedState,
      visitedState;
    const watcher = createWatcher(() => {
      readProducer(tick);
      if (!phase) {
        for (const n of [a, b, c, d]) readProducer(n);
        return;
      }
      readProducer(b);
      writeProducer(a, 1);
      unvisitedState = watcher.state;
      writeProducer(b, 1);
      visitedState = watcher.state;
      for (const n of [c, d, a]) readProducer(n);
    });
    runWatcher(watcher);
    phase = 1;
    writeProducer(tick, 1);
    runWatcher(watcher);
    assert.equal(unvisitedState & 4, 0);
    assert(visitedState & 4);
    assert(watcher.state & 4);
    integrity([a, b, c, d, tick, watcher]);
    disposeWatcher(watcher);
    lifecycleCases++;
  }
  for (const readAfterDispose of [false, true]) {
    const nodes = Array.from({ length: 4 }, () => createProducer(1)),
      tick = createProducer(0);
    let phase = 0;
    const watcher = createWatcher(() => {
      readProducer(tick);
      if (!phase) {
        nodes.forEach(readProducer);
        return;
      }
      readProducer(nodes[1]);
      disposeWatcher(watcher);
      if (readAfterDispose) readProducer(nodes[2]);
    });
    runWatcher(watcher);
    phase = 1;
    writeProducer(tick, 1);
    runWatcher(watcher);
    assert.equal(watcher.compute, undefined);
    assert.equal(incoming(watcher).length, readAfterDispose ? 1 : 0);
    integrity([...nodes, tick, watcher]);
    assert.equal(api.currentConsumer, null);
    lifecycleCases++;
  }
  {
    const nodes = Array.from({ length: 4 }, () => createProducer(1)),
      tick = createProducer(0);
    let phase = 0,
      runs = 0,
      cleanups = 0;
    const error = new Error("watcher");
    const watcher = createWatcher(() => {
      runs++;
      readProducer(tick);
      const order = phase ? [1, 2, 3, 0] : [0, 1, 2, 3];
      for (const i of order) {
        readProducer(nodes[i]);
        if (phase === 1 && i === 1) throw error;
      }
      return () => {
        cleanups++;
        assert.equal(api.currentConsumer, null);
        readProducer(nodes[0]);
      };
    });
    runWatcher(watcher);
    phase = 1;
    writeProducer(tick, 1);
    assert.throws(
      () => runWatcher(watcher),
      (e) => e === error,
    );
    integrity([...nodes, tick, watcher]);
    assert.equal(watcher.state & (1 | 2 | 4 | 8 | 32), 0);
    phase = 2;
    writeProducer(tick, 2);
    runWatcher(watcher);
    assert.equal(runs, 3);
    assert.equal(cleanups, 1);
    integrity([...nodes, tick, watcher]);
    disposeWatcher(watcher);
    assert.equal(cleanups, 2);
    lifecycleCases++;
  }
  // New dependency allocation followed by rotation, then throw and retry.
  for (const shrink of [false, true]) {
    const sources = Array.from({ length: 5 }, () => createProducer(1)),
      tick = createProducer(0);
    let trace = [0, 1, 2, 3],
      throwAfterMatch = false;
    const error = new Error("new-edge then rotation");
    const node = createConsumer(() => {
      readProducer(tick);
      let sum = 0;
      for (const id of trace) {
        sum += readProducer(sources[id]);
        if (throwAfterMatch && id === 1) throw error;
      }
      return sum;
    });
    readConsumer(node);
    const old = incoming(node);
    trace = [4, 1, 2, 3, 0];
    throwAfterMatch = true;
    writeProducer(tick, 1);
    assert.throws(
      () => readConsumer(node),
      (e) => e === error,
    );
    integrity([...sources, tick, node]);
    const partial = incoming(node);
    assert.equal(partial.length, 6);
    assert(old.every((e) => partial.includes(e)));
    const observed = partial
      .slice(0, partial.indexOf(node.tailIn) + 1)
      .map((e) => e.from);
    assert.deepEqual(observed, [tick, sources[4], sources[1]]);
    assert.equal(api.currentConsumer, null);
    throwAfterMatch = false;
    if (shrink) trace = [4, 0, 1];
    assert.equal(readConsumer(node), trace.length);
    assert.deepEqual(
      incoming(node).map((e) => e.from),
      [tick, ...trace.map((i) => sources[i])],
    );
    integrity([...sources, tick, node]);
    failureCases++;
  }
  results.push({ variant, primitiveCases, failureCases, lifecycleCases });
}
fs.writeFileSync(
  new URL("./results/verification.json", import.meta.url),
  JSON.stringify(results, null, 2) + "\n",
);
console.log(JSON.stringify(results));
