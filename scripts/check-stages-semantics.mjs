import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [action = "diff", before = "baseline", after = "candidate"] =
  process.argv.slice(2);
const goldenPath =
  "packages/reflex-runtime/test/fixtures/stages-semantics.json";
const seed = 20260910;
const stress = action === "stress";
function random(seed) {
  return (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
}
function environment(r, mode) {
  r.resetRuntimeContext();
  r.resetRuntimeProfileCounters();
  r.setRuntimeProfilingEnabled(mode === "dev");
  const nodes = [],
    nodeIds = new Map(),
    edges = [],
    edgeIds = new Map();
  const events = [],
    values = new Map();
  const add = (node) => {
    if (node === null) return -1;
    if (!nodeIds.has(node)) {
      nodeIds.set(node, nodes.length);
      nodes.push(node);
    }
    return nodeIds.get(node);
  };
  const edgeId = (edge) => {
    if (edge == null) return -1;
    if (!edgeIds.has(edge)) {
      edgeIds.set(edge, edges.length);
      edges.push(edge);
    }
    return edgeIds.get(edge);
  };
  const encode = (value) => {
    if (value === undefined) return { undefined: true };
    if (typeof value === "number") {
      if (Object.is(value, -0)) return { number: "-0" };
      if (!Number.isFinite(value)) return { number: String(value) };
    }
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    )
      return value;
    if ("firstIn" in value && "state" in value) return { node: add(value) };
    if ("prevIn" in value && "from" in value) return { edge: edgeId(value) };
    if (value instanceof Error)
      return { error: value.name, message: value.message };
    if (Array.isArray(value)) return value.map(encode);
    if (typeof value === "function") {
      if (!values.has(value)) values.set(value, values.size);
      return { function: values.get(value) };
    }
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, encode(value[key])]),
    );
  };
  r.installRuntimeDebug({
    collectDebugNodeRefs(edge, select, next) {
      const refs = [];
      for (; edge !== null; edge = next(edge))
        refs.push({ id: add(select(edge)) });
      return refs;
    },
    recordDebugEvent(_context, type, input) {
      events.push(["debug", type, encode(input)]);
    },
  });
  const graph = () => {
    for (const node of nodes) {
      let visited = 0;
      for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
        if (++visited > 10000) throw new Error("Cyclic incoming list");
        edgeId(edge);
      }
    }
    return {
      nodes: nodes.map((node) => [
        node.state,
        encode(node.payload),
        node.compute !== undefined,
        edgeId(node.firstIn),
        edgeId(node.lastIn),
        edgeId(node.tailIn),
        edgeId(node.firstOut),
        edgeId(node.lastOut),
      ]),
      edges: edges.map((edge) => [
        add(edge.from),
        add(edge.to),
        edge.version,
        edgeId(edge.prevIn),
        edgeId(edge.nextIn),
        edgeId(edge.prevOut),
        edgeId(edge.nextOut),
      ]),
    };
  };
  const boundary = () => {
    assert.equal(r.testPullHigh, 0, "pull stack high leaked");
    assert.equal(r.testPushHigh, 0, "push stack high leaked");
    assert(
      r.testPullStack.every((edge) => edge == null),
      "pull stack retained an edge",
    );
    assert(
      r.testPushStack.every((edge) => edge == null),
      "push stack retained an edge",
    );
    return {
      consumer: add(r.currentConsumer),
      epoch: r.trackingEpoch,
      state: r.runtimeState,
      phase: r.readRuntimePhase(),
      pull: r.readShouldRecomputeStackStats(),
      push: r.readPropagateStackStats(),
    };
  };
  const capture = (label, callback) => {
    let result;
    try {
      result = ["return", encode(callback())];
    } catch (error) {
      result = ["throw", encode(error)];
    }
    const snapshot = {
      label,
      result,
      graph: graph(),
      context: boundary(),
      events: events.splice(0),
      counters: r.readRuntimeProfileCounters(),
      topology: r.readRuntimeProfileTopology(),
    };
    return snapshot;
  };
  const make = (state = 0, compute = undefined) => {
    const n = new r.ReactiveNode(undefined, compute, state);
    add(n);
    return n;
  };
  return { r, nodes, add, make, events, capture, edgeId, encode };
}
function pushCase(r, mode, index) {
  const e = environment(r, mode),
    rnd = random(seed + index);
  const nodes = Array.from({ length: 24 }, () => e.make(rnd(64)));
  for (let from = 0; from < nodes.length - 1; from++) {
    for (let count = rnd(4); count > 0; count--) {
      const to = from + 1 + rnd(nodes.length - from - 1);
      e.edgeId(r.linkEdge(nodes[from], nodes[to], nodes[to].lastIn, rnd(5)));
    }
  }
  for (const node of nodes) {
    const incoming = [];
    for (let edge = node.firstIn; edge !== null; edge = edge.nextIn)
      incoming.push(edge);
    node.tailIn = incoming[rnd(incoming.length + 1)] ?? null;
  }
  const source = e.make();
  for (let i = 0; i < 6; i++) e.edgeId(r.linkEdge(source, nodes[i]));
  let hookCalls = 0;
  const failure = new Error("push hook failure");
  if (index % 4 !== 0)
    r.configureRuntimeContext({
      hooks: {
        onNodeInvalidated(node) {
          e.events.push([
            "invalidated",
            e.add(node),
            nodes.map((n) => n.state),
          ]);
          hookCalls++;
          if (index % 4 === 2 && hookCalls === 2) throw failure;
          if (index % 4 === 3 && hookCalls === 1)
            r.configureRuntimeContext({
              hooks: {
                onNodeInvalidated(next) {
                  e.events.push(["replacement-hook", e.add(next)]);
                },
              },
            });
        },
      },
    });
  const trace = [e.capture("push", () => r.propagate(source.firstOut))];
  trace.push(e.capture("push again", () => r.propagate(source.firstOut)));
  nodes.forEach((node, i) => {
    node.state = (i * 17 + index) & 63;
  });
  trace.push(
    e.capture("push once", () => r.push_iterator_once(source.firstOut)),
  );
  nodes.forEach((node, i) => {
    node.state = (i * 11 + index) & 63;
  });
  const skip =
    index % 3 === 0
      ? r.linkEdge(e.make(), e.make())
      : index % 3 === 1
        ? source.firstOut
        : source.lastOut;
  e.edgeId(skip);
  trace.push(
    e.capture("push once skipping", () =>
      r.push_iterator_once_skipping(source.firstOut, skip),
    ),
  );
  trace.push(e.capture("empty push", () => r.propagate(null)));
  return trace;
}
function apiCase(r, mode, index) {
  const e = environment(r, mode),
    rnd = random(seed ^ index);
  const sourceCount = 6,
    nodes = [],
    trace = [];
  for (let i = 0; i < sourceCount; i++) {
    const node = r.createProducer(i);
    e.add(node);
    nodes.push(node);
  }
  let fail = -1;
  const failure = new Error("compute failure");
  const read = (i) =>
    i < sourceCount ? r.readProducer(nodes[i]) : r.readConsumer(nodes[i]);
  for (let i = sourceCount; i < 28; i++) {
    const deps = [i - 1, rnd(i), rnd(i)];
    const node = r.createConsumer(() => {
      e.events.push(["compute", i, e.add(r.currentConsumer)]);
      let value = read(deps[0]);
      value += read(deps[1]);
      if ((value & 1) !== 0) value += read(deps[2]);
      if (fail === i) throw failure;
      return i % 4 === 0 ? value % 3 : value + 1;
    });
    e.add(node);
    nodes.push(node);
    trace.push(e.capture(`initial ${i}`, () => r.readConsumer(node)));
  }
  const watchers = [];
  r.configureRuntimeContext({
    hooks: {
      onNodeInvalidated(node) {
        e.events.push(["invalidated", e.add(node)]);
      },
    },
  });
  for (let i = 0; i < 3; i++) {
    const watcher = r.createWatcher(() => {
      e.events.push(["watch", i, read(25 + i)]);
      return () => e.events.push(["cleanup", i]);
    });
    e.add(watcher);
    watchers.push(watcher);
    trace.push(e.capture(`watch initial ${i}`, () => r.runWatcher(watcher)));
  }
  for (let step = 0; step < 36; step++) {
    const op = rnd(6),
      source = rnd(sourceCount);
    if (op <= 1) {
      trace.push(
        e.capture(`write ${source}`, () =>
          r.writeProducer(nodes[source], rnd(13)),
        ),
      );
    } else if (op === 2) {
      const target = sourceCount + rnd(nodes.length - sourceCount);
      trace.push(e.capture(`read ${target}`, () => read(target)));
    } else if (op === 3) {
      const target = rnd(watchers.length);
      trace.push(
        e.capture(`watch ${target}`, () => r.runWatcher(watchers[target])),
      );
    } else if (op === 4) {
      fail = sourceCount + rnd(nodes.length - sourceCount);
      trace.push(
        e.capture("invalidate before failure", () =>
          r.writeProducer(nodes[0], step + 100),
        ),
      );
      trace.push(
        e.capture("throwing read", () => {
          try {
            return read(27);
          } catch (error) {
            assert.equal(error, failure);
            throw error;
          }
        }),
      );
      fail = -1;
      trace.push(e.capture("retry", () => read(27)));
    } else {
      trace.push(
        e.capture("batch", () => {
          r.enterReactiveBatch();
          try {
            r.writeProducer(nodes[0], rnd(7));
            r.writeProducer(nodes[1], rnd(7));
            return read(27);
          } finally {
            r.leaveReactiveBatch();
          }
        }),
      );
    }
  }
  trace.push(e.capture("final root", () => read(27)));
  for (const watcher of watchers)
    trace.push(e.capture("final watcher", () => r.runWatcher(watcher)));
  return trace;
}
function valueCase(r, mode) {
  const e = environment(r, mode),
    trace = [],
    object = { value: 1 },
    fn = () => 1;
  const values = [
    undefined,
    null,
    NaN,
    NaN,
    0,
    -0,
    0,
    Infinity,
    "a",
    "a",
    object,
    object,
    { value: 1 },
    fn,
    fn,
  ];
  let next;
  const node = r.createConsumer(() => next);
  e.add(node);
  const subscriber = e.make(r.Watcher);
  e.edgeId(r.linkEdge(node, subscriber));
  r.configureRuntimeContext({
    hooks: {
      onNodeInvalidated(n) {
        e.events.push(["invalidated", e.add(n)]);
      },
    },
  });
  for (const value of values) {
    next = value;
    subscriber.state = r.Watcher;
    trace.push(e.capture("advance value", () => r.advance(node)));
  }
  const failure = { thrown: "original object" };
  node.compute = () => {
    throw failure;
  };
  trace.push(
    e.capture("original thrown value", () => {
      try {
        r.advance(node);
      } catch (error) {
        assert.equal(error, failure);
        throw error;
      }
    }),
  );
  return trace;
}
function nestedCase(r, mode) {
  const e = environment(r, mode),
    trace = [];
  let throwNested = false;
  const failure = new Error("nested failure");
  const build = (length, leafCompute) => {
    let parent = r.createConsumer(leafCompute);
    e.add(parent);
    r.readConsumer(parent);
    for (let i = 0; i < length; i++) {
      const dependency = parent;
      parent = r.createConsumer(() => r.readConsumer(dependency) + 1);
      e.add(parent);
      r.readConsumer(parent);
    }
    return parent;
  };
  const nestedSource = r.createProducer(1);
  e.add(nestedSource);
  const nestedRoot = build(4, () => {
    const value = r.readProducer(nestedSource);
    if (throwNested) throw failure;
    return value;
  });
  const source = r.createProducer(2);
  e.add(source);
  const root = build(8, () => {
    const value = r.readProducer(source);
    const high = r.testPullHigh,
      outer = r.testPullStack.slice(0, high);
    try {
      return value + r.readConsumer(nestedRoot);
    } catch (error) {
      assert.equal(error, failure);
      assert.equal(r.testPullHigh, high);
      assert.deepEqual(r.testPullStack.slice(0, high), outer);
      e.events.push(["caught nested", high]);
      return value;
    }
  });
  trace.push(e.capture("initial nested", () => r.readConsumer(root)));
  trace.push(e.capture("dirty nested", () => r.writeProducer(nestedSource, 2)));
  trace.push(e.capture("dirty outer", () => r.writeProducer(source, 3)));
  throwNested = true;
  trace.push(e.capture("catch nested", () => r.readConsumer(root)));
  throwNested = false;
  trace.push(e.capture("retry nested", () => r.readConsumer(nestedRoot)));
  return trace;
}
function deepCase(r, mode) {
  const e = environment(r, mode),
    trace = [];
  const source = r.createProducer(0);
  e.add(source);
  let parent = source;
  for (let i = 0; i < 600; i++) {
    const dependency = parent;
    parent = r.createConsumer(
      () =>
        (i === 0 ? r.readProducer(dependency) : r.readConsumer(dependency)) + 1,
    );
    e.add(parent);
    r.readConsumer(parent);
  }
  trace.push(e.capture("deep initial", () => r.readConsumer(parent)));
  trace.push(e.capture("deep invalidate", () => r.writeProducer(source, 1)));
  trace.push(e.capture("deep refresh", () => r.readConsumer(parent)));
  return trace;
}
function mutationCase(r, mode, variant) {
  const e = environment(r, mode),
    trace = [];
  const source = e.make(),
    branch = e.make(),
    leaf = e.make(r.Watcher);
  const watcher = e.make(r.Watcher),
    later = e.make(r.Watcher);
  r.linkEdge(source, branch);
  r.linkEdge(branch, leaf);
  const currentEdge = r.linkEdge(source, watcher);
  r.linkEdge(source, later);
  const nested = e.make(),
    nestedBranch = e.make(),
    nestedLeaf = e.make(r.Watcher),
    nestedWatcher = e.make(r.Watcher);
  r.linkEdge(nested, nestedBranch);
  r.linkEdge(nestedBranch, nestedLeaf);
  r.linkEdge(nested, nestedWatcher);
  const failure = new Error("nested push hook failure");
  let inHook = false;
  r.configureRuntimeContext({
    hooks: {
      onNodeInvalidated(node) {
        e.events.push(["hook", e.add(node)]);
        if (inHook) {
          if (variant === 3 && node === nestedWatcher) throw failure;
          return;
        }
        if (node !== watcher) return;
        if (variant === 0) {
          r.unlinkEdge(currentEdge);
          return;
        }
        if (variant === 1) {
          r.linkEdge(source, e.make(r.Watcher));
          return;
        }
        inHook = true;
        const high = r.testPushHigh,
          outer = r.testPushStack.slice(0, high);
        try {
          r.propagate(nested.firstOut);
        } catch (error) {
          assert.equal(error, failure);
          e.events.push(["nested push caught", high]);
        } finally {
          inHook = false;
        }
        assert.equal(r.testPushHigh, high);
        assert.deepEqual(r.testPushStack.slice(0, high), outer);
        assert(r.testPushStack.slice(high).every((edge) => edge == null));
      },
    },
  });
  trace.push(
    e.capture("mutating/reentrant push", () => r.propagate(source.firstOut)),
  );
  trace.push(
    e.capture("push after mutation", () => r.propagate(source.firstOut)),
  );
  return trace;
}
function directPullCase(r, mode, state) {
  const e = environment(r, mode),
    trace = [];
  const dependency = r.createConsumer(() => {
    e.events.push(["compute direct"]);
    return 1;
  });
  e.add(dependency);
  const parent = r.createConsumer(() => 2);
  e.add(parent);
  dependency.payload = 1;
  dependency.state = state;
  parent.state = r.Unknown;
  const edge = r.linkEdge(dependency, parent);
  trace.push(
    e.capture("direct pull state", () => r.pull_iterator(parent, edge)),
  );
  parent.state = r.Changed;
  dependency.state = r.Computing;
  trace.push(
    e.capture("changed parent skips computing dependency", () =>
      r.pull_iterator(parent, edge),
    ),
  );
  return trace;
}
const cases = [
  ...Array.from({ length: 4 }, (_, i) => [
    `push-mutation-${i}`,
    (r, m) => mutationCase(r, m, i),
  ]),
  ...Array.from({ length: 16 }, (_, i) => [
    `pull-state-${i}`,
    (r, m) => directPullCase(r, m, i),
  ]),
  ...Array.from({ length: stress ? 2048 : 128 }, (_, index) => [
    `push-${index}`,
    (r, mode) => pushCase(r, mode, index),
  ]),
  ...Array.from({ length: stress ? 256 : 24 }, (_, index) => [
    `api-${index}`,
    (r, mode) => apiCase(r, mode, index),
  ]),
  ["values", valueCase],
  ["nested-errors", nestedCase],
  ["deep-stacks", deepCase],
];
const report = { schemaVersion: 1, seed, cases: cases.length, modes: {} };
for (const mode of ["prod", "dev"]) {
  const load = (name) =>
    import(pathToFileURL(resolve("temp/stages", name, `${mode}.mjs`)).href);
  const baseline = await load(before);
  const candidate = action === "diff" || stress ? await load(after) : null;
  const hash = createHash("sha256");
  let steps = 0;
  for (const [name, execute] of cases) {
    const expected = execute(baseline, mode);
    hash.update(JSON.stringify([name, expected]));
    steps += expected.length;
    if (candidate) {
      const actual = execute(candidate, mode);
      assert.equal(
        actual.length,
        expected.length,
        `${mode}/${name}: trace length`,
      );
      for (let i = 0; i < expected.length; i++) {
        try {
          assert.deepEqual(actual[i], expected[i]);
        } catch (error) {
          writeFileSync(
            resolve("temp/stages", "difference.json"),
            JSON.stringify(
              { mode, name, step: i, expected: expected[i], actual: actual[i] },
              null,
              2,
            ),
          );
          throw new Error(
            `${mode}/${name}/${i} (${expected[i].label}): semantic difference; see temp/stages/difference.json`,
            { cause: error },
          );
        }
      }
    }
  }
  report.modes[mode] = { steps, sha256: hash.digest("hex") };
  console.log(
    `${mode}: ${cases.length} cases, ${steps} operation boundaries${candidate ? ", exact match" : ""}`,
  );
}
if (action === "record") {
  const reference = {
    sources: JSON.parse(
      readFileSync(resolve("temp/stages", before, "sources.json"), "utf8"),
    ),
  };
  writeFileSync(
    goldenPath,
    JSON.stringify({ ...report, reference }, null, 2) + "\n",
  );
  console.log(`Recorded ${goldenPath}`);
} else if (stress) {
  writeFileSync(
    resolve("temp/stages", `stress-${before}-vs-${after}.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Extended differential suite passed.");
} else {
  const frozen = JSON.parse(readFileSync(goldenPath, "utf8"));
  delete frozen.reference;
  assert.deepEqual(report, frozen, "Frozen stage semantics changed");
  console.log("Frozen stage semantics verified.");
}
