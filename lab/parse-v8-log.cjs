// parse-v8-log.cjs
const fs = require("node:fs");

const input = fs.readFileSync(0, "utf8");

const interestingFns = new Set([
  "touchOwned",
  "disposeOwned",
  "run",
  "recompute",
  "propagate",
]);

const events = [];
const ignored = [];
const unparsed = [];

function parseFunction(line) {
  const match = line.match(/<JSFunction(?: ([^ >]+))? \(sfi = /);

  if (!match) return null;

  return match[1] ?? "<anonymous>";
}

function parseReason(line) {
  return line.match(/reason: ([^\])]+)/)?.[1]?.trim() ?? null;
}

function parseTarget(line) {
  return line.match(/\(target ([^)]+)\)/)?.[1] ?? null;
}

function parseEvent(line) {
  const fn = parseFunction(line);
  const reason = parseReason(line);
  const target = parseTarget(line);

  if (line.includes("[manually marking")) {
    return { type: "MANUAL_MARK", fn, reason, target, line };
  }

  if (line.includes("[marking")) {
    return { type: "MARK", fn, reason, target, line };
  }

  if (line.includes("[compiling method")) {
    return { type: "COMPILE", fn, reason, target, line };
  }

  if (line.includes("[completed compiling")) {
    return { type: "COMPILED", fn, reason, target, line };
  }

  if (line.includes("[completed optimizing")) {
    return { type: "OPT", fn, reason, target, line };
  }

  if (line.includes("[bailout")) {
    return { type: "DEOPT", fn, reason, target, line };
  }

  return null;
}

for (const rawLine of input.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;

  const event = parseEvent(line);

  if (!event) {
    if (
      line.includes("[") ||
      line.includes("bailout") ||
      line.includes("optimizing") ||
      line.includes("compiling")
    ) {
      unparsed.push(line);
    }
    continue;
  }

  if (event.fn && !interestingFns.has(event.fn)) {
    ignored.push(event);
    continue;
  }

  events.push(event);
}

const byFn = new Map();

for (const event of events) {
  const fn = event.fn ?? "unknown";

  if (!byFn.has(fn)) {
    byFn.set(fn, {
      MANUAL_MARK: 0,
      MARK: 0,
      COMPILE: 0,
      COMPILED: 0,
      OPT: 0,
      DEOPT: 0,
      reasons: new Map(),
      targets: new Map(),
      lines: [],
    });
  }

  const stat = byFn.get(fn);
  stat[event.type]++;
  stat.lines.push(event);

  if (event.reason) {
    stat.reasons.set(event.reason, (stat.reasons.get(event.reason) ?? 0) + 1);
  }

  if (event.target) {
    stat.targets.set(event.target, (stat.targets.get(event.target) ?? 0) + 1);
  }
}

console.log("");
console.log("V8 OPT/DEOPT REPORT");
console.log("===================");
console.log("");

if (events.length === 0) {
  console.log(
    "No relevant V8 optimization events found for selected functions.",
  );
} else {
  for (const [fn, stat] of byFn) {
    console.log(`Function: ${fn}`);
    console.log(`  MANUAL   : ${stat.MANUAL_MARK}`);
    console.log(`  MARK     : ${stat.MARK}`);
    console.log(`  COMPILE  : ${stat.COMPILE}`);
    console.log(`  COMPILED : ${stat.COMPILED}`);
    console.log(`  OPT      : ${stat.OPT}`);
    console.log(`  DEOPT    : ${stat.DEOPT}`);

    if (stat.targets.size > 0) {
      console.log("  Targets  :");
      for (const [target, count] of stat.targets) {
        console.log(`    - ${target}: ${count}`);
      }
    }

    if (stat.reasons.size > 0) {
      console.log("  Reasons  :");
      for (const [reason, count] of stat.reasons) {
        console.log(`    - ${reason}: ${count}`);
      }
    }

    const wrongMap = [...stat.reasons.keys()].some((reason) =>
      reason.includes("wrong map"),
    );

    if (stat.DEOPT === 0) {
      console.log("  Verdict  : OK, no deopts for this function.");
    } else if (wrongMap) {
      console.log("  Verdict  : BAD, hidden class / map deopt detected.");
    } else {
      console.log("  Verdict  : CHECK, deopt exists but not from wrong map.");
    }

    console.log("");
  }
}

const totalRelevantDeopts = events.filter((event) => event.type === "DEOPT");
const wrongMapDeopts = totalRelevantDeopts.filter((event) =>
  event.reason?.includes("wrong map"),
);

console.log("SUMMARY");
console.log("=======");
console.log(`Relevant events : ${events.length}`);
console.log(`Relevant deopts : ${totalRelevantDeopts.length}`);
console.log(`Wrong map deopts: ${wrongMapDeopts.length}`);
console.log(`Ignored events  : ${ignored.length}`);
console.log(`Unparsed lines  : ${unparsed.length}`);
console.log("");

if (wrongMapDeopts.length === 0) {
  console.log(
    "Final verdict: no hidden-class deopt detected in selected hot functions.",
  );
} else {
  console.log(
    "Final verdict: hidden-class instability detected. Congratulations, V8 found your shape zoo.",
  );
}

console.log("");

if (ignored.length > 0) {
  console.log("IGNORED EVENTS");
  console.log("==============");

  for (const event of ignored) {
    console.log(
      `${event.type.padEnd(8)} | ${event.fn ?? "unknown"} | ${
        event.reason ?? ""
      }`,
    );
  }

  console.log("");
}

if (unparsed.length > 0) {
  console.log("UNPARSED / NOT ACCOUNTED FOR");
  console.log("============================");

  for (const line of unparsed) {
    console.log(line);
  }

  console.log("");
}
