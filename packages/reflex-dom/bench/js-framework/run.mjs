// Local js-framework-benchmark harness for reflex-dom vs. vanilla JS.
//
// Reproduces the keyed CPU benchmarks of js-framework-benchmark
// (webdriver-ts/src/benchmarksCommon.ts + benchmarksPlaywright.ts): the same
// init/warmup and run steps, CPU throttling factors and DOM conditions, with
// durations computed from a Chrome trace by the port in ./timeline.mjs. Memory
// and bundle-size benchmarks follow the same steps; see README.md for the
// documented deviations.
//
//   node bench/js-framework/run.mjs [options]
//
//   --frameworks=vanillajs,reflex-dom   frameworks to compare (first = baseline)
//   --benchmarks=01,04                  benchmark id prefixes (default: all)
//   --suite=all                         krausest | extended | all
//   --no-diagnose                       skip the DOM mutation / allocation pass
//   --count=15                          CPU iterations per benchmark
//   --mem-count=1                       memory iterations per benchmark
//   --no-throttle                       disable CPU throttling
//   --no-memory / --no-size             skip memory / size benchmarks
//   --headed                            run a visible browser window
//   --skip-build                        reuse .build/
//   --compiler                          compile reflex-dom with the DOM compiler
//   --keep-traces                       write Chrome traces to results/traces

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { cpus, platform, release } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { buildApps, buildRoot, frameworks } from "./build.mjs";
import {
  CPU_BENCHMARK_WEIGHTS,
  studentTTest,
  summarize,
  weightedGeometricMean,
} from "./stats.mjs";
import { computeCPUResult } from "./timeline.mjs";

const benchRoot = dirname(fileURLToPath(import.meta.url));
const resultsRoot = join(benchRoot, "results");

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function parseOptions(argv) {
  const options = {
    frameworks: ["vanillajs", "reflex-dom"],
    benchmarks: [],
    count: 15,
    memCount: 1,
    throttle: true,
    memory: true,
    size: true,
    headed: false,
    build: true,
    compiler: false,
    keepTraces: false,
    suite: "all",
    diagnose: true,
  };

  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    switch (key) {
      case "frameworks":
        options.frameworks = value.split(",").filter(Boolean);
        break;
      case "benchmarks":
        options.benchmarks = value.split(",").filter(Boolean);
        break;
      case "count":
        options.count = Number(value);
        break;
      case "mem-count":
        options.memCount = Number(value);
        break;
      case "no-throttle":
        options.throttle = false;
        break;
      case "no-memory":
        options.memory = false;
        break;
      case "no-size":
        options.size = false;
        break;
      case "headed":
        options.headed = true;
        break;
      case "skip-build":
        options.build = false;
        break;
      case "compiler":
        options.compiler = true;
        break;
      case "keep-traces":
        options.keepTraces = true;
        break;
      case "suite":
        if (!["krausest", "extended", "all"].includes(value)) {
          throw new Error(`--suite must be krausest, extended or all`);
        }
        options.suite = value;
        break;
      case "no-diagnose":
        options.diagnose = false;
        break;
      default:
        throw new Error(`Unknown option ${arg}`);
    }
  }

  for (const name of options.frameworks) {
    if (!(name in frameworks)) throw new Error(`Unknown framework "${name}".`);
  }

  return options;
}

// ---------------------------------------------------------------------------
// Page helpers. Conditions are polled from Node, never with timers or
// requestAnimationFrame inside the page: in-page polling adds TimerFire /
// FireAnimationFrame events that move the measured end to a later commit.
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const td = (row, column) => `tbody>tr:nth-of-type(${row})>td:nth-of-type(${column})`;

async function waitFor(page, description, predicate, arg, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(predicate, arg)) return;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
    await sleep(2);
  }
}

const waitExists = (page, selector) =>
  waitFor(page, `${selector} to exist`, (s) => document.querySelector(s) !== null, selector);

const waitGone = (page, selector) =>
  waitFor(page, `${selector} to disappear`, (s) => document.querySelector(s) === null, selector);

const waitText = (page, selector, text) =>
  waitFor(
    page,
    `${selector} to contain "${text}"`,
    ([s, t]) => document.querySelector(s)?.textContent?.includes(t) === true,
    [selector, String(text)],
  );

const waitClass = (page, selector, className) =>
  waitFor(
    page,
    `${selector} to have class ${className}`,
    ([s, c]) => document.querySelector(s)?.classList.contains(c) === true,
    [selector, className],
  );

const waitCount = (page, selector, count) =>
  waitFor(
    page,
    `${count} × ${selector}`,
    ([s, n]) => document.querySelectorAll(s).length === n,
    [selector, count],
  );

const click = (page, selector) => page.click(selector);

async function createAndClear(page, warmupCount) {
  await waitExists(page, "#run");
  for (let i = 0; i < warmupCount; i++) {
    await click(page, "#run");
    await waitText(page, td(1, 1), i * 1000 + 1);
    await click(page, "#clear");
    await waitGone(page, td(1000, 1));
  }
}

// ---------------------------------------------------------------------------
// Benchmarks (ids, warmups and throttling from benchmarksCommon.ts)
// ---------------------------------------------------------------------------

const cpuBenchmarks = [
  {
    id: "01_run1k",
    label: "create rows",
    description: "creating 1,000 rows",
    warmupCount: 5,
    slowdown: 1,
    async init(page) {
      await createAndClear(page, this.warmupCount);
    },
    async run(page) {
      await click(page, "#run");
      await waitText(page, td(1000, 1), (this.warmupCount + 1) * 1000);
    },
  },
  {
    id: "02_replace1k",
    label: "replace all rows",
    description: "updating all 1,000 rows",
    warmupCount: 5,
    slowdown: 1,
    async init(page) {
      await waitExists(page, "#run");
      for (let i = 0; i < this.warmupCount; i++) {
        await click(page, "#run");
        await waitText(page, td(1, 1), i * 1000 + 1);
      }
    },
    async run(page) {
      await click(page, "#run");
      await waitText(page, td(1, 1), this.warmupCount * 1000 + 1);
    },
  },
  {
    id: "03_update10th1k_x16",
    label: "partial update",
    description: "updating every 10th row for 1,000 rows",
    warmupCount: 3,
    slowdown: 4,
    async init(page) {
      await waitExists(page, "#run");
      await click(page, "#run");
      await waitExists(page, td(1000, 1));
      for (let i = 0; i < this.warmupCount; i++) {
        await click(page, "#update");
        await waitText(page, `${td(991, 2)}>a`, " !!!".repeat(i + 1));
      }
    },
    async run(page) {
      await click(page, "#update");
      await waitText(page, `${td(991, 2)}>a`, " !!!".repeat(this.warmupCount + 1));
    },
  },
  {
    id: "04_select1k",
    label: "select row",
    description: "highlighting a selected row",
    warmupCount: 5,
    additionalRuns: 10,
    slowdown: 4,
    async init(page) {
      await waitExists(page, "#run");
      await click(page, "#run");
      await waitText(page, td(1000, 1), 1000);
      await click(page, `${td(5, 2)}>a`);
      await waitClass(page, "tbody>tr:nth-of-type(5)", "danger");
      await waitCount(page, "tbody>tr.danger", 1);
    },
    async run(page) {
      await click(page, `${td(2, 2)}>a`);
      await waitClass(page, "tbody>tr:nth-of-type(2)", "danger");
    },
  },
  {
    id: "05_swap1k",
    label: "swap rows",
    description: "swap 2 rows for table with 1,000 rows",
    warmupCount: 5,
    slowdown: 4,
    async init(page) {
      await waitExists(page, "#run");
      await click(page, "#run");
      await waitExists(page, td(1000, 1));
      for (let i = 0; i <= this.warmupCount; i++) {
        await click(page, "#swaprows");
        await waitText(page, td(999, 1), i % 2 === 0 ? 2 : 999);
      }
    },
    async run(page) {
      const odd = (this.warmupCount + 2) % 2 === 1;
      await click(page, "#swaprows");
      await waitText(page, td(999, 1), odd ? 2 : 999);
      await waitText(page, td(2, 1), odd ? 999 : 2);
    },
  },
  {
    id: "06_remove-one-1k",
    label: "remove row",
    description: "removing one row",
    warmupCount: 5,
    slowdown: 2,
    async init(page) {
      const skip = 4;
      const warm = this.warmupCount;
      await waitExists(page, "#run");
      await click(page, "#run");
      await waitExists(page, td(1000, 1));
      for (let i = 0; i < warm; i++) {
        const row = warm - i + skip;
        await waitText(page, td(row, 1), row);
        await click(page, `${td(row, 3)}>a>span:nth-of-type(1)`);
        await waitText(page, td(row, 1), skip + warm + 1);
      }
      await waitText(page, td(skip + 1, 1), skip + warm + 1);
      await waitText(page, td(skip, 1), skip);

      await waitText(page, td(skip + 2, 1), skip + warm + 2);
      await click(page, `${td(skip + 2, 3)}>a>span:nth-of-type(1)`);
      await waitText(page, td(skip + 2, 1), skip + warm + 3);
    },
    async run(page) {
      await click(page, `${td(4, 3)}>a>span:nth-of-type(1)`);
      await waitText(page, td(4, 1), 4 + this.warmupCount + 1);
    },
  },
  {
    id: "07_create10k",
    label: "create many rows",
    description: "creating 10,000 rows",
    warmupCount: 5,
    slowdown: 1,
    async init(page) {
      await createAndClear(page, this.warmupCount);
    },
    async run(page) {
      await click(page, "#runlots");
      await waitExists(page, `${td(10000, 2)}>a`);
    },
  },
  {
    id: "08_create1k-after1k_x2",
    label: "append rows to large table",
    description: "appending 1,000 to a table of 1,000 rows",
    warmupCount: 5,
    slowdown: 1,
    async init(page) {
      await createAndClear(page, this.warmupCount);
      await click(page, "#run");
      await waitExists(page, td(1000, 1));
    },
    async run(page) {
      await click(page, "#add");
      await waitExists(page, td(2000, 1));
    },
  },
  {
    id: "09_clear1k_x8",
    label: "clear rows",
    description: "clearing a table with 1,000 rows",
    warmupCount: 5,
    slowdown: 4,
    async init(page) {
      await createAndClear(page, this.warmupCount);
      await click(page, "#run");
      await waitText(page, td(1, 1), this.warmupCount * 1000 + 1);
    },
    async run(page) {
      await click(page, "#clear");
      await waitGone(page, td(1000, 1));
    },
  },
];

for (const benchmark of cpuBenchmarks) benchmark.suite = "krausest";

// ---------------------------------------------------------------------------
// Extended scenarios (not in js-framework-benchmark), see README.md. The
// harness mirrors every operation of ../shared/ops.js on row ids to know the
// expected table, so completion is detected from the DOM like above.
// ---------------------------------------------------------------------------

const MARK = " *";

/** Ids and label marks the table should show; ids follow buildData's counter. */
function createModel() {
  return { ids: [], marks: new Map(), nextId: 1 };
}

function fresh(model, count) {
  const ids = new Array(count);
  for (let i = 0; i < count; i++) ids[i] = model.nextId++;
  return ids;
}

function markIds(model, predicate) {
  model.ids.forEach((id, index) => {
    if (predicate(index)) model.marks.set(id, (model.marks.get(id) ?? 0) + 1);
  });
}

function moveId(model, from, to) {
  if (model.ids.length <= 998) return;
  const [id] = model.ids.splice(from, 1);
  model.ids.splice(to, 0, id);
}

const modelOperations = {
  run(model) {
    model.ids = fresh(model, 1000);
  },
  clear(model) {
    model.ids = [];
  },
  refreshone: (model) => markIds(model, (index) => index === 0),
  refresh10th: (model) => markIds(model, (index) => index % 10 === 0),
  moveforward: (model) => moveId(model, 998, 1),
  movebackward: (model) => moveId(model, 1, 998),
  reverse(model) {
    model.ids.reverse();
  },
  interleave(model) {
    const even = model.ids.filter((_, index) => index % 2 === 0);
    const odd = model.ids.filter((_, index) => index % 2 === 1);
    model.ids = even.concat(odd);
  },
  replacehalf(model) {
    const ids = fresh(model, Math.floor(model.ids.length / 2));
    let next = 0;
    model.ids = model.ids.map((id, index) => (index % 2 === 1 ? ids[next++] : id));
  },
  updateall: (model) => markIds(model, () => true),
  prepend(model) {
    model.ids = fresh(model, 1000).concat(model.ids);
  },
  remove10th(model) {
    model.ids = model.ids.filter((_, index) => index % 10 !== 0);
  },
};

/** Waits until the table matches the model at a few probe rows and in length. */
function waitModel(page, model) {
  const length = model.ids.length;
  const probes = [...new Set([0, 1, 2, length >> 1, length - 2, length - 1])].filter(
    (index) => index >= 0 && index < length,
  );
  const expected = probes.map((index) => {
    const id = model.ids[index];
    return [index, String(id), MARK.repeat(model.marks.get(id) ?? 0)];
  });

  return waitFor(
    page,
    `table to match the model (${length} rows)`,
    ([rows, count]) => {
      const trs = document.querySelectorAll("tbody>tr");
      if (trs.length !== count) return false;
      return rows.every(([index, id, mark]) => {
        const cells = trs[index].children;
        return cells[0].textContent === id && (mark === "" || cells[1].textContent.endsWith(mark));
      });
    },
    [expected, length],
  );
}

async function step(page, model, button) {
  modelOperations[button](model);
  await click(page, `#${button}`);
  await waitModel(page, model);
}

function extendedBenchmark({ id, label, description, button, kind, slowdown, warmupCount = 5 }) {
  return {
    id,
    label,
    description,
    kind,
    suite: "extended",
    warmupCount,
    slowdown,
    async init(page) {
      this.model = createModel();
      await waitExists(page, "#run");
      // Same JIT warmup as the original benchmarks, then the operation itself,
      // then a fresh table of 1,000 rows for the measured run.
      for (let i = 0; i < 5; i++) {
        await step(page, this.model, "run");
        await step(page, this.model, "clear");
      }
      await step(page, this.model, "run");
      for (let i = 0; i < this.warmupCount; i++) await step(page, this.model, button);
      await step(page, this.model, "run");
    },
    async run(page) {
      await step(page, this.model, button);
    },
  };
}

const extendedBenchmarks = [
  {
    id: "10_refresh-one-1k",
    label: "refresh, one label changed",
    description: "new array of new objects for 1,000 rows, one label differs",
    button: "refreshone",
    kind: "snapshot",
    slowdown: 4,
  },
  {
    id: "11_refresh-10th-1k",
    label: "refresh, every 10th label changed",
    description: "new array of new objects for 1,000 rows, 100 labels differ",
    button: "refresh10th",
    kind: "snapshot",
    slowdown: 4,
  },
  {
    id: "12_move-forward-1k",
    label: "move one row forward",
    description: "snapshot in which row 999 moved to position 2",
    button: "moveforward",
    kind: "snapshot",
    slowdown: 4,
  },
  {
    id: "13_move-backward-1k",
    label: "move one row backward",
    description: "snapshot in which row 2 moved to position 999",
    button: "movebackward",
    kind: "snapshot",
    slowdown: 4,
  },
  {
    id: "14_reverse-1k",
    label: "reverse rows",
    description: "snapshot in reversed order",
    button: "reverse",
    kind: "snapshot",
    slowdown: 2,
  },
  {
    id: "15_interleave-1k",
    label: "interleave rows",
    description: "snapshot: rows at even positions, then rows at odd positions",
    button: "interleave",
    kind: "snapshot",
    slowdown: 2,
  },
  {
    id: "16_replace-half-1k",
    label: "replace every second row",
    description: "snapshot in which 500 interleaved rows are new",
    button: "replacehalf",
    kind: "snapshot",
    slowdown: 1,
  },
  {
    id: "17_update-all-1k",
    label: "update all labels",
    description: "every label of 1,000 rows changes (known to the handler)",
    button: "updateall",
    kind: "direct",
    slowdown: 2,
  },
  {
    id: "18_prepend1k-to-1k",
    label: "prepend rows",
    description: "1,000 new rows before 1,000 rows (known to the handler)",
    button: "prepend",
    kind: "direct",
    slowdown: 1,
  },
  {
    id: "19_remove-10th-1k",
    label: "remove every 10th row",
    description: "100 of 1,000 rows removed (known to the handler)",
    button: "remove10th",
    kind: "direct",
    slowdown: 2,
  },
].map(extendedBenchmark);

const memoryBenchmarks = [
  {
    id: "21_ready-memory",
    label: "ready memory",
    description: "memory usage after page load",
    async run() {},
  },
  {
    id: "22_run-memory",
    label: "run memory",
    description: "memory usage after adding 1,000 rows",
    async run(page) {
      await click(page, "#run");
      await waitExists(page, `${td(1, 2)}>a`);
    },
  },
  {
    id: "25_run-clear-memory",
    label: "creating/clearing 1k rows (5 cycles)",
    description: "memory usage after creating and clearing 1,000 rows 5 times",
    async run(page) {
      for (let i = 0; i < 5; i++) {
        await click(page, "#run");
        await waitText(page, td(1000, 1), 1000 * (i + 1));
        await click(page, "#clear");
        await waitGone(page, td(1000, 1));
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function startServer(root) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    if (url.pathname.endsWith("/")) path = join(path, "index.html");
    try {
      const body = readFileSync(path);
      response
        .writeHead(200, {
          "content-type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
          "cache-control": "no-store",
        })
        .end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
  });
}

// Chrome flags used by js-framework-benchmark's runner.
const CHROME_ARGS = [
  "--js-flags=--expose-gc",
  "--enable-precise-memory-info",
  "--no-first-run",
  "--disable-extensions",
  "--disable-default-apps",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--window-size=1000,800",
];

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "blink.user_timing",
  "v8.execute",
];

async function openPage(browser, baseURL, framework) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(`${baseURL}/${framework}/`, { waitUntil: "load" });
  return { context, page, cdp };
}

async function measureCPU(browser, baseURL, framework, benchmark, options, iteration) {
  const { context, page, cdp } = await openPage(browser, baseURL, framework);
  try {
    await benchmark.init(page);

    const slowdown = options.throttle ? benchmark.slowdown : 1;
    if (slowdown > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: slowdown });

    await browser.startTracing(page, { categories: TRACE_CATEGORIES });
    await benchmark.run(page);
    // Let the frame that renders the change commit before stopping the trace.
    await sleep(100);
    const trace = JSON.parse((await browser.stopTracing()).toString("utf8"));

    if (slowdown > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    if (options.keepTraces) {
      const dir = join(resultsRoot, "traces");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${framework}_${benchmark.id}_${iteration}.json`), JSON.stringify(trace));
    }

    return computeCPUResult(trace);
  } finally {
    await context.close();
  }
}

async function measureMemory(browser, baseURL, framework, benchmark) {
  const { context, page, cdp } = await openPage(browser, baseURL, framework);
  try {
    await waitExists(page, "#run");
    await benchmark.run(page);
    await sleep(100);
    for (let i = 0; i < 3; i++) await cdp.send("HeapProfiler.collectGarbage");
    const { usedSize } = await cdp.send("Runtime.getHeapUsage");
    return usedSize / 1024 / 1024;
  } finally {
    await context.close();
  }
}

/**
 * Untimed diagnostic pass: the DOM mutations one operation performs on the
 * table, and the JS heap it allocates. A MutationObserver slows the page down,
 * so this never shares a page with a timed iteration.
 *
 * - inserted / removed: nodes connected or disconnected, excluding moves
 * - moved: nodes removed and inserted again (insertBefore of a connected node)
 * - text / attribute writes, and how many of them left the value unchanged
 * - comments inserted: anchor nodes
 * - heap: used JS heap after minus before, without a forced GC (a GC during
 *   the operation lowers it; compare frameworks, not absolute values)
 */
async function diagnose(browser, baseURL, framework, benchmark) {
  const { context, page, cdp } = await openPage(browser, baseURL, framework);
  try {
    await benchmark.init(page);
    await page.evaluate(() => {
      const records = [];
      const observer = new MutationObserver((list) => records.push(...list));
      observer.observe(document.querySelector("tbody"), {
        subtree: true,
        childList: true,
        characterData: true,
        characterDataOldValue: true,
        attributes: true,
        attributeOldValue: true,
      });
      globalThis.__diagnostics = { records, observer };
    });
    for (let i = 0; i < 2; i++) await cdp.send("HeapProfiler.collectGarbage");
    const before = (await cdp.send("Runtime.getHeapUsage")).usedSize;

    await benchmark.run(page);

    const after = (await cdp.send("Runtime.getHeapUsage")).usedSize;
    const counts = await page.evaluate(() => {
      const { records, observer } = globalThis.__diagnostics;
      records.push(...observer.takeRecords());
      observer.disconnect();

      const added = new Set();
      const removed = new Set();
      let textWrites = 0;
      let textUnchanged = 0;
      let attributeWrites = 0;
      let attributeUnchanged = 0;

      for (const record of records) {
        switch (record.type) {
          case "childList":
            for (const node of record.removedNodes) removed.add(node);
            for (const node of record.addedNodes) added.add(node);
            break;
          case "characterData":
            textWrites++;
            if (record.oldValue === record.target.data) textUnchanged++;
            break;
          case "attributes":
            attributeWrites++;
            if (record.oldValue === record.target.getAttribute(record.attributeName)) {
              attributeUnchanged++;
            }
            break;
        }
      }

      let moved = 0;
      let inserted = 0;
      let commentsInserted = 0;
      for (const node of added) {
        if (removed.has(node)) {
          if (node.isConnected) moved++;
          continue;
        }
        inserted++;
        if (node.nodeType === 8) commentsInserted++;
      }
      let removedOnly = 0;
      for (const node of removed) if (!added.has(node)) removedOnly++;

      return {
        records: records.length,
        inserted,
        removed: removedOnly,
        moved,
        commentsInserted,
        textWrites,
        textUnchanged,
        attributeWrites,
        attributeUnchanged,
      };
    });

    return { ...counts, heapMB: (after - before) / 1024 / 1024 };
  } finally {
    await context.close();
  }
}

function measureSize(framework) {
  const assets = join(buildRoot, framework, "assets");
  const scripts = readdirSync(assets).filter((file) => file.endsWith(".js"));
  const source = Buffer.concat(scripts.map((file) => readFileSync(join(assets, file))));
  return {
    uncompressed: source.length / 1024,
    gzip: gzipSync(source, { level: 9 }).length / 1024,
    brotli: brotliCompressSync(source, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).length / 1024,
  };
}

const PHASE_KEYS = ["gc", "style", "layout", "paint", "commit", "layouts", "styleRecalcs"];

/** Interleaves frameworks per iteration (A,B then B,A) so drift is shared. */
const orderFor = (names, iteration) => (iteration % 2 === 0 ? names : [...names].reverse());

const selectBenchmarks = (list, prefixes) =>
  prefixes.length === 0 ? list : list.filter((b) => prefixes.some((p) => b.id.startsWith(p)));

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const fmt = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : "—");

const table = (head, rows) => [
  `| ${head.join(" | ")} |`,
  `|${" --- |".repeat(head.length)}`,
  ...rows.map((cells) => `| ${cells.join(" | ")} |`),
  "",
];

const ratio = (value, base) => (base > 0 ? value / base : NaN);

/** Ratio cell: bold when the other framework spends less than the baseline. */
const ratioCell = (value, base, p) => {
  const r = ratio(value, base);
  if (!Number.isFinite(r)) return "—";
  const text = r < 1 ? `**${fmt(r, 2)}**` : fmt(r, 2);
  return p === undefined ? text : `${text}${p < 0.05 ? "" : " (n.s.)"}`;
};

/**
 * Per benchmark: the other framework's time relative to the baseline in total
 * and by phase, then the lists of benchmarks where it is faster, not
 * distinguishable, or slower (Student's t-test on totals, p < 0.05).
 */
function advantageSection(cpu, names) {
  const [baseline, ...others] = names;
  const lines = [];

  for (const other of others) {
    const faster = [];
    const undecided = [];
    const slower = [];
    const lessScript = [];
    const rows = [];

    for (const row of cpu) {
      const a = row.frameworks[baseline];
      const b = row.frameworks[other];
      if (!a || !b) continue;

      const pTotal = studentTTest(a.total, b.total);
      const pScript = studentTTest(a.script, b.script);
      const rTotal = ratio(b.total.mean, a.total.mean);
      if (pTotal < 0.05) (rTotal < 1 ? faster : slower).push(`${row.id} (${fmt(rTotal, 2)})`);
      else undecided.push(`${row.id} (${fmt(rTotal, 2)})`);
      if (pScript < 0.05 && b.script.mean < a.script.mean) lessScript.push(row.id);

      const phase = (fw, ...keys) => keys.reduce((sum, key) => sum + fw.phases[key].mean, 0);
      rows.push([
        row.id,
        ratioCell(b.total.mean, a.total.mean, pTotal),
        ratioCell(b.script.mean, a.script.mean, pScript),
        ratioCell(phase(b, "style", "layout"), phase(a, "style", "layout")),
        ratioCell(phase(b, "paint", "commit"), phase(a, "paint", "commit")),
        `${fmt(b.phases.gc.mean)} / ${fmt(a.phases.gc.mean)}`,
      ]);
    }

    lines.push(
      `## Where ${other} is ahead of ${baseline}`,
      "",
      `Ratios ${other} / ${baseline} (bold: ${other} spends less; n.s.: p ≥ 0.05). ` +
        `GC is mean ms inside the measured window, ${other} / ${baseline}.`,
      "",
      ...table(["benchmark", "total", "script", "style + layout", "paint + commit", "gc ms"], rows),
      `- Faster in total (p < 0.05): ${faster.join(", ") || "none"}`,
      `- Not distinguishable: ${undecided.join(", ") || "none"}`,
      `- Slower in total (p < 0.05): ${slower.join(", ") || "none"}`,
      `- Less script time (p < 0.05): ${lessScript.join(", ") || "none"}`,
      "",
    );
  }

  return lines;
}

function phaseSection(cpu, names) {
  const lines = ["## Time by phase (mean ms inside the measured window)", ""];

  for (const name of names) {
    const rows = cpu
      .filter((row) => row.frameworks[name])
      .map((row) => {
        const fw = row.frameworks[name];
        const p = fw.phases;
        return [
          row.id,
          fmt(fw.total.mean),
          fmt(fw.script.mean),
          fmt(p.gc.mean),
          fmt(p.style.mean),
          fmt(p.layout.mean),
          fmt(p.paint.mean),
          fmt(p.commit.mean),
          fmt(p.layouts.mean, 1),
          fmt(p.styleRecalcs.mean, 1),
        ];
      });
    lines.push(
      `### ${name}`,
      "",
      ...table(
        ["benchmark", "total", "script", "gc", "style", "layout", "paint", "commit", "layouts", "style recalcs"],
        rows,
      ),
    );
  }

  return lines;
}

function diagnosticsSection(cpu, names) {
  const rows = [];
  for (const row of cpu) {
    for (const name of names) {
      const d = row.frameworks[name]?.diagnostics;
      if (!d) continue;
      rows.push([
        row.id,
        name,
        d.inserted,
        d.removed,
        d.moved,
        d.commentsInserted,
        `${d.textWrites} (${d.textUnchanged})`,
        `${d.attributeWrites} (${d.attributeUnchanged})`,
        fmt(d.heapMB, 2),
      ]);
    }
  }

  return [
    "## DOM work per operation (one untimed pass)",
    "",
    "Top-level nodes inserted into / removed from the table (a row inserted with its " +
      "cells counts once), connected nodes moved, anchor comments inserted, text and " +
      "attribute writes (in parentheses: writes that left the value unchanged), and JS " +
      "heap growth without a forced GC.",
    "",
    ...table(
      ["benchmark", "framework", "inserted", "removed", "moved", "comments", "text writes", "attribute writes", "heap Δ MB"],
      rows,
    ),
  ];
}

function report(results, options) {
  const names = options.frameworks;
  const [baseline] = names;
  const lines = [];
  const header = (cells) => `| ${cells.join(" | ")} |`;
  const separator = (count) => `|${" --- |".repeat(count)}`;

  lines.push(`# js-framework-benchmark (local) — ${names.join(" vs ")}`, "");
  lines.push(
    `${results.environment.browser} · ${results.environment.os} · ${results.environment.cpu}`,
    "",
    `CPU: ${options.count} iterations (+ additional runs where the original has them), ` +
      `throttling ${options.throttle ? "on" : "off"}. Values are mean ± 95% CI in ms; ` +
      `factors are relative to ${baseline}; p from Student's t-test (undecided above 0.05).`,
    "",
  );

  if (results.compiler) {
    const summary = results.compiler.summary;
    lines.push(
      `reflex-dom compiler: auto; ${summary.template} template, ${summary.native} native, ` +
        `${summary.runtime} runtime regions.`,
      "",
    );
  }

  const others = names.slice(1);
  const suiteTitles = {
    krausest: "js-framework-benchmark keyed suite",
    extended: "Extended scenarios (not in js-framework-benchmark)",
  };

  for (const suite of ["krausest", "extended"]) {
    const rows = results.cpu.filter((row) => (row.suite ?? "krausest") === suite);
    if (rows.length === 0) continue;

    lines.push(
      `## ${suiteTitles[suite]}`,
      "",
      header([
        "benchmark",
        ...names,
        ...others.map((n) => `${n} / ${baseline}`),
        ...others.map((n) => `p (${n})`),
      ]),
      separator(1 + names.length + others.length * 2),
    );

    const factorsVsFastest = Object.fromEntries(names.map((n) => [n, {}]));

    for (const row of rows) {
      const stats = names.map((n) => row.frameworks[n]?.total);
      const fastest = Math.min(...stats.map((s) => s?.mean ?? Infinity));
      names.forEach((n, i) => {
        if (stats[i]) factorsVsFastest[n][row.id] = stats[i].mean / fastest;
      });

      const base = stats[0];
      const notes = [row.kind, row.slowdown > 1 ? `${row.slowdown}× slowdown` : null].filter(Boolean);
      lines.push(
        header([
          `${row.label} (${[row.id, ...notes].join(", ")})`,
          ...stats.map((s) => (s ? `${fmt(s.mean)} ± ${fmt(s.ci)}` : "—")),
          ...stats.slice(1).map((s) => (s && base ? `**${fmt(s.mean / base.mean, 2)}**` : "—")),
          ...stats.slice(1).map((s) => (s && base ? fmt(studentTTest(base, s), 3) : "—")),
        ]),
      );
    }

    const weights =
      suite === "krausest"
        ? CPU_BENCHMARK_WEIGHTS
        : Object.fromEntries(rows.map((row) => [row.id, 1]));
    lines.push(
      header([
        suite === "krausest"
          ? "weighted geometric mean (factor vs. fastest)"
          : "geometric mean (factor vs. fastest)",
        ...names.map((n) => fmt(weightedGeometricMean(factorsVsFastest[n], weights), 2)),
        ...others.map(() => ""),
        ...others.map(() => ""),
      ]),
      "",
    );
  }

  if (results.cpu.length > 0) {
    lines.push(...advantageSection(results.cpu, names), ...phaseSection(results.cpu, names));
  }
  if (results.cpu.some((row) => names.some((n) => row.frameworks[n]?.diagnostics))) {
    lines.push(...diagnosticsSection(results.cpu, names));
  }

  if (results.memory.length > 0) {
    lines.push(header(["memory (MB, JS heap after GC)", ...names]), separator(1 + names.length));
    for (const row of results.memory) {
      lines.push(header([`${row.label} (${row.id})`, ...names.map((n) => fmt(row.frameworks[n]?.mean, 2))]));
    }
    lines.push("");
  }

  if (results.size) {
    lines.push(header(["size (kB)", ...names]), separator(1 + names.length));
    for (const key of ["uncompressed", "gzip", "brotli"]) {
      lines.push(header([key, ...names.map((n) => fmt(results.size[n][key], 1))]));
    }
    lines.push("");
  }

  if (results.errors.length > 0) {
    lines.push(`Dropped iterations: ${results.errors.length} (see JSON for details).`, "");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const options = parseOptions(process.argv.slice(2));

if (options.build) {
  console.log(`Building ${options.frameworks.join(", ")}…`);
  await buildApps(options.frameworks, { compiler: options.compiler });
}

const compilerReport = options.compiler && options.frameworks.includes("reflex-dom")
  ? JSON.parse(readFileSync(join(buildRoot, "reflex-dom", "compiler-report.json"), "utf8"))
  : null;
if (compilerReport && compilerReport.summary.template + compilerReport.summary.native === 0) {
  throw new Error("--compiler produced no compiled DOM regions; inspect .build/reflex-dom/compiler-report.json before benchmarking.");
}

const server = await startServer(resolve(buildRoot));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  channel: "chromium",
  headless: !options.headed,
  args: CHROME_ARGS,
});

const results = {
  environment: {
    browser: `Chromium ${browser.version()}${options.headed ? "" : " (headless)"}`,
    os: `${platform()} ${release()}`,
    cpu: `${cpus()[0]?.model ?? "unknown CPU"} × ${cpus().length}`,
    node: process.version,
    date: new Date().toISOString(),
  },
  options,
  compiler: compilerReport,
  cpu: [],
  memory: [],
  size: null,
  errors: [],
};

try {
  const suites = {
    krausest: cpuBenchmarks,
    extended: extendedBenchmarks,
    all: [...cpuBenchmarks, ...extendedBenchmarks],
  };

  for (const benchmark of selectBenchmarks(suites[options.suite], options.benchmarks)) {
    const iterations = options.count + (benchmark.additionalRuns ?? 0);
    const samples = Object.fromEntries(
      options.frameworks.map((n) => [
        n,
        {
          total: [],
          script: [],
          paint: [],
          phases: Object.fromEntries(PHASE_KEYS.map((key) => [key, []])),
        },
      ]),
    );

    for (let i = 0; i < iterations; i++) {
      for (const framework of orderFor(options.frameworks, i)) {
        try {
          const result = await measureCPU(browser, baseURL, framework, benchmark, options, i);
          samples[framework].total.push(result.total);
          samples[framework].script.push(result.script);
          samples[framework].paint.push(result.paint);
          for (const key of PHASE_KEYS) samples[framework].phases[key].push(result.phases[key]);
        } catch (error) {
          results.errors.push({ benchmark: benchmark.id, framework, iteration: i, error: String(error) });
          console.warn(`  dropped ${framework} ${benchmark.id} #${i}: ${error}`);
        }
      }
      process.stdout.write(`\r${benchmark.id}: ${i + 1}/${iterations}`);
    }
    process.stdout.write("\n");

    const diagnostics = {};
    if (options.diagnose) {
      for (const framework of options.frameworks) {
        try {
          diagnostics[framework] = await diagnose(browser, baseURL, framework, benchmark);
        } catch (error) {
          results.errors.push({ benchmark: benchmark.id, framework, diagnostics: true, error: String(error) });
          console.warn(`  diagnostics failed for ${framework} ${benchmark.id}: ${error}`);
        }
      }
    }

    results.cpu.push({
      id: benchmark.id,
      label: benchmark.label,
      description: benchmark.description,
      suite: benchmark.suite,
      kind: benchmark.kind ?? null,
      slowdown: options.throttle ? benchmark.slowdown : 1,
      frameworks: Object.fromEntries(
        options.frameworks.map((n) => [
          n,
          {
            total: summarize(samples[n].total),
            script: summarize(samples[n].script),
            paint: summarize(samples[n].paint),
            phases: Object.fromEntries(
              PHASE_KEYS.map((key) => [key, summarize(samples[n].phases[key])]),
            ),
            diagnostics: diagnostics[n] ?? null,
          },
        ]),
      ),
    });
  }

  if (options.memory) {
    for (const benchmark of selectBenchmarks(memoryBenchmarks, options.benchmarks)) {
      const samples = Object.fromEntries(options.frameworks.map((n) => [n, []]));
      for (let i = 0; i < options.memCount; i++) {
        for (const framework of orderFor(options.frameworks, i)) {
          try {
            samples[framework].push(await measureMemory(browser, baseURL, framework, benchmark));
          } catch (error) {
            results.errors.push({ benchmark: benchmark.id, framework, iteration: i, error: String(error) });
          }
        }
      }
      console.log(`${benchmark.id}: done`);
      results.memory.push({
        id: benchmark.id,
        label: benchmark.label,
        description: benchmark.description,
        frameworks: Object.fromEntries(options.frameworks.map((n) => [n, summarize(samples[n])])),
      });
    }
  }

  if (options.size) {
    results.size = Object.fromEntries(options.frameworks.map((n) => [n, measureSize(n)]));
  }
} finally {
  await browser.close();
  server.close();
}

mkdirSync(resultsRoot, { recursive: true });
const stamp = results.environment.date.replace(/[:.]/g, "-");
const markdown = report(results, options);
writeFileSync(join(resultsRoot, `${stamp}.json`), JSON.stringify(results, null, 2));
writeFileSync(join(resultsRoot, `${stamp}.md`), markdown);
writeFileSync(join(resultsRoot, "latest.md"), markdown);

console.log(`\n${markdown}`);
console.log(`Results: ${join(resultsRoot, `${stamp}.json`)}`);
