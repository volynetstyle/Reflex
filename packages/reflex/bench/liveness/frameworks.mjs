import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Adapters for the liveness comparison. "timing" mode loads the unmodified
// production builds. "structural" mode loads copies of the Angular and Preact
// builds with counters injected at fixed sites (each replacement must match
// an exact number of times, so a version bump fails loudly instead of
// silently miscounting). Reflex's structural leg runs from source under the
// __PROFILE__ build (see structural.test.mjs); its adapter is passed in.

export const FRAMEWORKS = ["reflex", "angular", "preact"];

export const FRAMEWORK_LABELS = {
  reflex: "Reflex (facade, working tree)",
  angular: "@angular/core 22.2.0 primitives/signals",
  preact: "@preact/signals-core 1.14.4",
};

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../package.json"));
const CACHE = join(here, "../../node_modules/.cache/reflex-liveness");

/**
 * Uniform structural counters:
 * - linkAlloc:   dependency link objects allocated.
 * - subscribe:   insertions into a producer's subscriber list.
 * - unsubscribe: removals from a producer's subscriber list.
 * - pollVisits:  dependency links inspected while validating freshness.
 * - notifyVisits: subscriber links visited while propagating a change.
 */
export const COUNTERS = [
  "linkAlloc",
  "subscribe",
  "unsubscribe",
  "pollVisits",
  "notifyVisits",
];

function zeroCounters() {
  return Object.fromEntries(COUNTERS.map((name) => [name, 0]));
}

function replaceExactly(source, from, to, count, file) {
  const parts = source.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(
      `${file}: expected ${count} occurrence(s) of ${JSON.stringify(from)}, found ${parts.length - 1}`,
    );
  }
  return parts.join(to);
}

// ------------------------------------------------------------------ Angular

const ANGULAR_FILES = [
  "primitives-signals.mjs",
  "_effect-chunk.mjs",
  "_untracked-chunk.mjs",
  "_weak_ref-chunk.mjs",
];

function instrumentAngular() {
  const source = dirname(
    require.resolve("@angular/core/primitives/signals"),
  );
  const target = join(CACHE, "angular");
  mkdirSync(target, { recursive: true });
  for (const file of ANGULAR_FILES) {
    let code = readFileSync(join(source, file), "utf8");
    if (file === "_effect-chunk.mjs") {
      code = `const __LV = (globalThis.__LV_angular ??= {});\n${code}`;
      code = replaceExactly(
        code,
        "  const newLink = {",
        "  __LV.linkAlloc++;\n  const newLink = {",
        1,
        file,
      );
      code = replaceExactly(
        code,
        "function producerAddLiveConsumer(node, link) {",
        "function producerAddLiveConsumer(node, link) {\n  __LV.subscribe++;",
        1,
        file,
      );
      code = replaceExactly(
        code,
        "function producerRemoveLiveConsumerLink(link) {",
        "function producerRemoveLiveConsumerLink(link) {\n  __LV.unsubscribe++;",
        1,
        file,
      );
      code = replaceExactly(
        code,
        "for (let link = node.producers; link !== undefined; link = link.nextProducer) {\n    const producer = link.producer;\n    const seenVersion",
        "for (let link = node.producers; link !== undefined; link = link.nextProducer) {\n    __LV.pollVisits++;\n    const producer = link.producer;\n    const seenVersion",
        1,
        file,
      );
      code = replaceExactly(
        code,
        "for (let link = node.consumers; link !== undefined; link = link.nextConsumer) {\n      const consumer = link.consumer;",
        "for (let link = node.consumers; link !== undefined; link = link.nextConsumer) {\n      __LV.notifyVisits++;\n      const consumer = link.consumer;",
        1,
        file,
      );
    }
    writeFileSync(join(target, file), code);
  }
  return pathToFileURL(join(target, "primitives-signals.mjs")).href;
}

async function loadAngular(mode) {
  // Production Angular builds define ngDevMode = false.
  globalThis.ngDevMode = false;
  const url =
    mode === "structural"
      ? instrumentAngular()
      : pathToFileURL(require.resolve("@angular/core/primitives/signals"))
          .href;
  const ng = await import(url);
  const counters = (globalThis.__LV_angular ??= {});
  Object.assign(counters, zeroCounters());

  return {
    counters: () => ({ ...counters }),
    session() {
      const queue = [];
      return {
        signal(initial) {
          const [read, set] = ng.createSignal(initial);
          return { read, write: set };
        },
        computed(fn) {
          return { read: ng.createComputed(fn) };
        },
        effect(fn) {
          const watch = ng.createWatch(
            () => fn(),
            (ref) => queue.push(ref),
            false,
          );
          watch.run();
          return () => watch.destroy();
        },
        flush() {
          for (let i = 0; i < queue.length; i++) queue[i].run();
          queue.length = 0;
        },
      };
    },
  };
}

// ------------------------------------------------------------------ Preact

function instrumentPreact() {
  const file = require.resolve("@preact/signals-core");
  const mjs = join(dirname(file), "signals-core.mjs");
  let code = readFileSync(mjs, "utf8");
  code = `const __LV = (globalThis.__LV_preact ??= {});\n${code}`;
  code = replaceExactly(
    code,
    "if(void 0===t||t.t!==o){t={i:0,S:i,",
    "if(void 0===t||t.t!==o){__LV.linkAlloc++;t={i:0,S:i,",
    1,
    "signals-core.mjs",
  );
  code = replaceExactly(
    code,
    "if(t!==i&&void 0===i.e){i.x=t;",
    "if(t!==i&&void 0===i.e){__LV.subscribe++;i.x=t;",
    1,
    "signals-core.mjs",
  );
  code = replaceExactly(
    code,
    "a.prototype.U=function(i){if(void 0!==this.t){",
    "a.prototype.U=function(i){if(void 0!==this.t){__LV.unsubscribe++;",
    1,
    "signals-core.mjs",
  );
  code = replaceExactly(
    code,
    "function w(i){for(let t=i.s;void 0!==t;t=t.n)if(",
    "function w(i){for(let t=i.s;void 0!==t;t=t.n)if(__LV.pollVisits++,",
    1,
    "signals-core.mjs",
  );
  code = replaceExactly(
    code,
    "i.t.N()",
    "(__LV.notifyVisits++,i.t.N())",
    2,
    "signals-core.mjs",
  );
  const target = join(CACHE, "preact");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "signals-core.mjs"), code);
  return pathToFileURL(join(target, "signals-core.mjs")).href;
}

async function loadPreact(mode) {
  const url =
    mode === "structural"
      ? instrumentPreact()
      : pathToFileURL(
          join(
            dirname(require.resolve("@preact/signals-core")),
            "signals-core.mjs",
          ),
        ).href;
  const preact = await import(url);
  const counters = (globalThis.__LV_preact ??= {});
  Object.assign(counters, zeroCounters());

  return {
    counters: () => ({ ...counters }),
    session() {
      return {
        signal(initial) {
          const cell = preact.signal(initial);
          return {
            read: () => cell.value,
            write: (value) => void (cell.value = value),
          };
        },
        computed(fn) {
          const cell = preact.computed(fn);
          return { read: () => cell.value };
        },
        effect(fn) {
          return preact.effect(() => {
            fn();
          });
        },
        flush() {},
      };
    },
  };
}

// ------------------------------------------------------------------ Reflex

/** Session over the Reflex facade module (production dist or source). */
export function reflexAdapter(reflex, counters = () => zeroCounters()) {
  return {
    counters,
    session() {
      reflex.createRuntime({ effectStrategy: "flush" });
      return {
        signal(initial) {
          const cell = reflex.signal(initial);
          return { read: cell, write: (value) => void cell.set(value) };
        },
        computed(fn) {
          return { read: reflex.computed(fn) };
        },
        effect(fn) {
          return reflex.effect(() => {
            fn();
          });
        },
        flush: reflex.flush,
      };
    },
  };
}

export async function loadFramework(name, mode = "timing") {
  switch (name) {
    case "angular":
      return loadAngular(mode);
    case "preact":
      return loadPreact(mode);
    case "reflex":
      if (mode !== "timing") {
        throw new Error("Reflex structural runs from source; see structural.test.mjs");
      }
      return reflexAdapter(await import("../../dist/esm/index.js"));
    default:
      throw new Error(`Unknown framework: ${name}`);
  }
}
