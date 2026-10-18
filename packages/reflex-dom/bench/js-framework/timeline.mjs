// Port of js-framework-benchmark's webdriver-ts/src/timeline.ts
// (computeResultsCPU, computeResultsJS, computeResultsPaint).
//
// total:  from the start of the single `click` EventDispatch to the end of the
//         first Commit after the last script/layout/frame event of the
//         operation (falling back to the last Commit after the click), with
//         the same requestAnimationFrame delay correction.
// script: union of JS trace slices inside that window (nested slices dropped).
// paint:  union of style/layout/paint/commit slices inside that window.

const JS_EVENT_NAMES = new Set([
  "EventDispatch",
  "EvaluateScript",
  "v8.evaluateModule",
  "FunctionCall",
  "TimerFire",
  "FireIdleCallback",
  "FireAnimationFrame",
  "RunMicrotasks",
  "V8.Execute",
]);

const PAINT_EVENT_NAMES = new Set([
  "UpdateLayoutTree",
  "Layout",
  "Commit",
  "Paint",
  "Layerize",
  "PrePaint",
]);

const COMPLETE_EVENT_TYPES = {
  Layout: "layout",
  FunctionCall: "functioncall",
  HitTest: "hittest",
  Commit: "commit",
  Paint: "paint",
  FireAnimationFrame: "fireAnimationFrame",
};

function extractRelevantEvents(traceEvents) {
  const events = [];

  for (const e of traceEvents) {
    let type;
    let dur = e.dur ?? 0;

    if (e.name === "EventDispatch") {
      const eventType = e.args?.data?.type;
      if (eventType === "click") type = "click";
      else if (eventType === "mousedown") type = "mousedown";
      else if (eventType === "pointerup") type = "pointerup";
    } else if (e.ph === "X" && e.name in COMPLETE_EVENT_TYPES) {
      type = COMPLETE_EVENT_TYPES[e.name];
    } else if (e.name === "TimerFire" && e.ph === "X") {
      type = "timerFire";
      dur = 0;
    } else if (e.name === "RequestAnimationFrame") {
      type = "requestAnimationFrame";
      dur = 0;
    }

    if (type !== undefined) {
      events.push({ type, ts: e.ts, dur, end: e.ts + dur, pid: e.pid });
    }
  }

  return events.sort((a, b) => a.end - b.end);
}

/** Sum of interval lengths after dropping intervals contained in another. */
function containedIntervalsDuration(intervals) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];

  for (const interval of sorted) {
    const last = kept.at(-1);
    if (last !== undefined && interval.start >= last.start && interval.end <= last.end) {
      continue;
    }
    kept.push(interval);
  }

  return kept.reduce((sum, i) => sum + (i.end - i.start), 0) / 1000;
}

function sliceDuration(traceEvents, names, tsStart, tsEnd, pid, includeClick) {
  const intervals = [];

  for (const e of traceEvents) {
    if (e.ph !== "X" || e.pid !== pid || !names.has(e.name)) continue;
    if (e.ts < tsStart || e.ts > tsEnd) continue;
    if (!includeClick && e.name === "EventDispatch") continue;
    intervals.push({ start: e.ts, end: e.ts + (e.dur ?? 0) });
  }

  return containedIntervalsDuration(intervals);
}

/**
 * Computes `{ total, script, paint }` in milliseconds for one CPU benchmark
 * trace. Throws, like the original, when the trace is not interpretable; the
 * caller drops that iteration.
 */
export function computeCPUResult(trace) {
  const traceEvents = Array.isArray(trace) ? trace : trace.traceEvents;
  const events = extractRelevantEvents(traceEvents);

  const clicks = events.filter((e) => e.type === "click");
  if (clicks.length !== 1) {
    throw new Error(`exactly one click event is expected, found ${clicks.length}`);
  }

  const click = clicks[0];
  const samePid = events.filter((e) => e.pid === click.pid);
  const duringBenchmark = samePid.filter((e) => e.ts > click.end || e === click);

  const startFrom = duringBenchmark.filter(
    (e) =>
      e.type === "click" ||
      e.type === "fireAnimationFrame" ||
      e.type === "timerFire" ||
      e.type === "layout" ||
      e.type === "functioncall",
  );
  const startFromEvent = startFrom.at(-1);

  const commitsAfterClick = duringBenchmark.filter((e) => e.type === "commit");
  const commit =
    commitsAfterClick.find((e) => e.ts > startFromEvent.end) ?? commitsAfterClick.at(-1);

  if (commit === undefined) {
    throw new Error("no commit event found after the click");
  }

  let total = (commit.end - click.ts) / 1000;

  const rafsWithinClick = samePid.filter(
    (e) => e.type === "requestAnimationFrame" && e.ts >= click.ts && e.ts <= click.end,
  );
  const fafs = samePid.filter(
    (e) => e.type === "fireAnimationFrame" && e.ts >= click.ts && e.ts < commit.ts,
  );

  if (rafsWithinClick.length === 1 && fafs.length === 1) {
    const waitDelay = (fafs[0].ts - click.end) / 1000;
    const layoutBeforeFaf = samePid.some(
      (e) => e.type === "layout" && e.ts > click.end && e.ts < fafs[0].ts,
    );
    if (waitDelay > 16 && !layoutBeforeFaf) {
      total -= waitDelay - 16;
    }
  }

  return {
    total,
    script: sliceDuration(traceEvents, JS_EVENT_NAMES, click.ts, commit.end, click.pid, true),
    paint: sliceDuration(traceEvents, PAINT_EVENT_NAMES, click.ts, commit.end, click.pid, false),
  };
}
