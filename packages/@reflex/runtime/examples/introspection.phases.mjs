import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  WATCHER_INITIAL_STATE,
  ReactiveNode,
  createExecutionContext,
  readConsumer,
  readProducer,
  runWatcher,
  setDefaultContext,
  subtle,
  writeProducer,
} from "@reflex/runtime/debug";

const pending = [];
const context = createExecutionContext({
  onEffectInvalidated(node) {
    if (!pending.includes(node)) {
      pending.push(node);
    }
  },
  onReactiveSettled() {
    console.log("  settled");
  },
});

setDefaultContext(context);
subtle.configure({ historyLimit: 500 }, context);

const flag = subtle.label(
  new ReactiveNode(true, null, PRODUCER_INITIAL_STATE),
  "flag",
);
const left = subtle.label(
  new ReactiveNode(1, null, PRODUCER_INITIAL_STATE),
  "left",
);
const right = subtle.label(
  new ReactiveNode(10, null, PRODUCER_INITIAL_STATE),
  "right",
);
const selected = subtle.label(
  new ReactiveNode(
    undefined,
    () => (readProducer(flag) ? readProducer(left) : readProducer(right)),
    CONSUMER_INITIAL_STATE,
  ),
  "selected",
);
const effect = subtle.label(
  new ReactiveNode(null, () => {
    const value = readConsumer(selected);
    console.log(`  effect -> selected = ${value}`);
  }, WATCHER_INITIAL_STATE),
  "effect",
);

subtle.clearHistory(context);

function refName(ref) {
  if (!ref) return "none";
  return ref.label ?? `${ref.kind}#${ref.id}`;
}

function valueText(value) {
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return value.toString();
  if (value === undefined) return "undefined";

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function nodeName(node) {
  return refName(subtle.snapshot(node));
}

function describeDetail(detail = {}) {
  const parts = [];

  if ("mode" in detail) parts.push(`mode=${detail.mode}`);
  if ("reason" in detail) parts.push(`reason=${detail.reason}`);
  if ("changed" in detail) parts.push(`changed=${detail.changed}`);
  if ("immediate" in detail) parts.push(`immediate=${detail.immediate}`);
  if ("hadCleanup" in detail) parts.push(`hadCleanup=${detail.hadCleanup}`);
  if ("hasCleanup" in detail) parts.push(`hasCleanup=${detail.hasCleanup}`);

  if ("previous" in detail || "next" in detail) {
    parts.push(
      `value=${valueText(detail.previous)} -> ${valueText(detail.next)}`,
    );
  }

  if (
    Array.isArray(detail.removedSources) &&
    detail.removedSources.length > 0
  ) {
    parts.push(
      `removed=[${detail.removedSources.map((ref) => refName(ref)).join(", ")}]`,
    );
  }

  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function describeEvent(event) {
  const participants = [];

  if (event.source && event.consumer) {
    participants.push(`${refName(event.source)} -> ${refName(event.consumer)}`);
  } else if (event.source || event.target) {
    participants.push(`${refName(event.source)} -> ${refName(event.target)}`);
  } else if (event.node && event.consumer) {
    participants.push(
      `${refName(event.node)} (consumer=${refName(event.consumer)})`,
    );
  } else if (event.node) {
    participants.push(refName(event.node));
  } else if (event.consumer) {
    participants.push(`consumer=${refName(event.consumer)}`);
  }

  return `  - ${event.type}${participants.length > 0 ? ` ${participants.join(" ")}` : ""}${describeDetail(event.detail)}`;
}

function printSnapshot(node) {
  const snapshot = subtle.snapshot(node);

  console.log(
    `  snapshot ${refName(snapshot)}: dirty=${snapshot.dirty}, value=${valueText(snapshot.payload)}, sources=[${snapshot.sources.map((ref) => refName(ref)).join(", ")}], subscribers=[${snapshot.subscribers.map((ref) => refName(ref)).join(", ")}]`,
  );
}

function printContext() {
  const snapshot = subtle.context(context);
  const queued =
    pending.length > 0 ? pending.map((node) => nodeName(node)).join(", ") : "(empty)";

  console.log(
    `  context: depth=${snapshot.propagationDepth}, active=${refName(snapshot.activeComputed)}, history=${snapshot.historySize}, queue=${queued}`,
  );
}

function flushPending(label) {
  if (pending.length === 0) {
    console.log(`  flush ${label}: queue is empty`);
    return;
  }

  while (pending.length > 0) {
    const node = pending.shift();
    console.log(`  flush ${label}: run ${nodeName(node)}`);
    runWatcher(node, context);
  }
}

function phase(title, work) {
  const start = subtle.history(context).length;

  console.log(`\n=== ${title} ===`);
  work();

  const events = subtle.history(context).slice(start);

  console.log("  events:");
  if (events.length === 0) {
    console.log("  - (none)");
  } else {
    for (const event of events) {
      console.log(describeEvent(event));
    }
  }

  printSnapshot(selected);
  printSnapshot(effect);
  printContext();
}

console.log("Reactive graph introspection demo");
console.log("Uses @reflex/runtime/debug and subtle history snapshots.");

phase("phase 0 / initial execution", () => {
  runWatcher(effect, context);
});

phase("phase 1 / write inactive right branch", () => {
  writeProducer(right, 11, context);
  flushPending("right=11");
});

phase("phase 2 / write active left branch", () => {
  writeProducer(left, 2, context);
  flushPending("left=2");
});

phase("phase 3 / switch selector to right branch", () => {
  writeProducer(flag, false, context);
  flushPending("flag=false");
});

phase("phase 4 / stale left write does nothing", () => {
  writeProducer(left, 3, context);
  flushPending("left=3");
});

phase("phase 5 / active right write invalidates again", () => {
  writeProducer(right, 20, context);
  flushPending("right=20");
});
