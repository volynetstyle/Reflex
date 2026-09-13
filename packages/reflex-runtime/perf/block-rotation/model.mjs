import assert from "node:assert/strict";
// Offline replay for the unique-source, fanout-one experiment traces only.
// It is never imported into a runtime bundle or executed inside a timed batch.
export function replay(oldOrder, trace, variant, stopAfter = trace.length) {
  const order = oldOrder.slice();
  let cursor = 0;
  const counts = { A: 0, L: 0, U: 0, M: 0, B: 0, W: 1 }; // advance resets tailIn
  const events = [];
  const actual = trace.slice(0, stopAfter);
  for (let readIndex = 0; readIndex < actual.length; readIndex++) {
    const source = actual[readIndex],
      i = order.indexOf(source);
    if (i < 0) {
      order.splice(cursor, 0, source);
      cursor++;
      counts.A++;
      counts.L++;
      counts.W += 11;
      continue;
    }
    if (i < cursor) continue;
    if (i === cursor) {
      cursor++;
      counts.W++;
      continue;
    }
    const gap = i - cursor;
    const rotate = variant === "rotate" && cursor > 0 && gap <= 2;
    const event = {
      kind: rotate ? "rotation" : "move",
      candidateSearchDistance: gap + 1,
      skippedBlockLength: gap,
      remainingSuffixLength: order.length - i - 1,
    };
    if (rotate) {
      const skipped = order.slice(cursor, i);
      let distance = null;
      for (let j = readIndex + 1; j < actual.length; j++)
        if (skipped.includes(actual[j])) {
          distance = j - readIndex;
          break;
        }
      event.nextReadWasSkippedBlockHead = actual[readIndex + 1] === skipped[0];
      event.readsUntilSkippedBlockReuse = distance;
      event.censored = distance === null && stopAfter < trace.length;
      order.splice(cursor, gap);
      order.push(...skipped);
      counts.B++;
    } else {
      order.splice(i, 1);
      order.splice(cursor, 0, source);
      counts.M++;
    }
    events.push(event);
    counts.W += 7;
    cursor++;
  }
  const thrown = stopAfter < trace.length;
  if (!thrown) {
    const stale = order.length - cursor;
    if (stale) {
      counts.U += stale;
      counts.W += 2 + 6 * stale;
      order.length = cursor;
    }
  }
  return { order, prefix: order.slice(0, cursor), counts, events, thrown };
}
export function distribution(values) {
  if (!values.length)
    return { count: 0, min: null, max: null, mean: null, histogram: {} };
  const histogram = {};
  for (const n of values) histogram[n] = (histogram[n] ?? 0) + 1;
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    histogram,
  };
}
export function eventSummary(events) {
  const rotations = events.filter((e) => e.kind === "rotation");
  return {
    candidateSearchDistance: distribution(
      events.map((e) => e.candidateSearchDistance),
    ),
    skippedBlockLength: distribution(events.map((e) => e.skippedBlockLength)),
    remainingSuffixLength: distribution(
      events.map((e) => e.remainingSuffixLength),
    ),
    rotationCandidateSearchDistance: distribution(
      rotations.map((e) => e.candidateSearchDistance),
    ),
    nextReadWasSkippedBlockHead: rotations.filter(
      (e) => e.nextReadWasSkippedBlockHead,
    ).length,
    readsUntilSkippedBlockReuse: distribution(
      rotations
        .filter((e) => e.readsUntilSkippedBlockReuse !== null)
        .map((e) => e.readsUntilSkippedBlockReuse),
    ),
    notReusedBySuccessfulPassEnd: rotations.filter(
      (e) => e.readsUntilSkippedBlockReuse === null && !e.censored,
    ).length,
    notReusedBeforeThrow: rotations.filter((e) => e.censored).length,
    blockRotations: rotations.length,
  };
}
export function checkCounts(actual, model) {
  for (const key of ["A", "L", "U", "M", "B", "W"])
    assert.equal(actual[key], model[key], `actual/replay ${key}`);
}
