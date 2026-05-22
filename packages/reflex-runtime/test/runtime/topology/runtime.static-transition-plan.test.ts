import { beforeEach, describe, expect, it } from "vitest";
import {
  createConsumer,
  createProducer,
  createStaticTransitionPlan,
  createWatcher,
  readConsumer,
  readProducer,
  resetRuntime,
  runWatcher,
  setRuntimeHooks,
  writeStaticPlanSource,
} from "../../runtime.test_utils";

describe("Reactive runtime - static transition plan", () => {
  beforeEach(() => {
    resetRuntime();
  });

  it("executes a stabilized object-ref plan linearly", () => {
    setRuntimeHooks((node) => runWatcher(node));

    const source = createProducer(1);
    const doubled = createConsumer(() => readProducer(source) * 2);
    const plusOne = createConsumer(() => readConsumer(doubled) + 1);

    let observed = 0;
    const sink = createWatcher(() => {
      observed = readConsumer(plusOne);
    });

    runWatcher(sink);
    expect(observed).toBe(3);

    const plan = createStaticTransitionPlan([source]);

    expect(plan.sources).toEqual([source]);
    expect(plan.nodes).toEqual([doubled, plusOne]);
    expect(plan.sinks).toEqual([sink]);
    expect(plan.guard.validate()).toBe(true);

    expect(writeStaticPlanSource(plan, source, 4)).toBe(true);

    expect(observed).toBe(9);
    expect(doubled.payload).toBe(8);
    expect(plusOne.payload).toBe(9);
    expect(plan.versions).toEqual([1, 1, 1]);
  });

  it("deopts the object-ref plan when topology changes", () => {
    setRuntimeHooks((node) => runWatcher(node));

    const flag = createProducer(true);
    const left = createProducer(1);
    const right = createProducer(10);
    const selected = createConsumer(() =>
      readProducer(flag) ? readProducer(left) : readProducer(right),
    );

    let observed = 0;
    const sink = createWatcher(() => {
      observed = readConsumer(selected);
    });

    runWatcher(sink);
    expect(observed).toBe(1);

    const plan = createStaticTransitionPlan([left]);

    expect(plan.nodes).toEqual([selected]);
    expect(plan.guard.validate()).toBe(true);

    flag.payload = false;

    expect(writeStaticPlanSource(plan, left, 2)).toBe(false);
    expect(plan.guard.validate()).toBe(false);
    expect(observed).toBe(1);
  });

  it("topologically orders a diamond and recomputes the join once", () => {
    setRuntimeHooks((node) => runWatcher(node));

    const source = createProducer(1);
    let bRuns = 0;
    let cRuns = 0;
    let dRuns = 0;

    const b = createConsumer(() => {
      bRuns += 1;
      return readProducer(source) + 1;
    });
    const c = createConsumer(() => {
      cRuns += 1;
      return readProducer(source) + 2;
    });
    const d = createConsumer(() => {
      dRuns += 1;
      return readConsumer(b) + readConsumer(c);
    });

    let observed = 0;
    const sink = createWatcher(() => {
      observed = readConsumer(d);
    });

    runWatcher(sink);
    expect(observed).toBe(5);
    expect({ bRuns, cRuns, dRuns }).toEqual({ bRuns: 1, cRuns: 1, dRuns: 1 });

    const plan = createStaticTransitionPlan([source]);

    expect(plan.nodes).toEqual([b, c, d]);

    bRuns = 0;
    cRuns = 0;
    dRuns = 0;

    expect(writeStaticPlanSource(plan, source, 2)).toBe(true);

    expect(observed).toBe(7);
    expect({ bRuns, cRuns, dRuns }).toEqual({ bRuns: 1, cRuns: 1, dRuns: 1 });
  });

  it("builds valid plans for fan-out, fan-in, layered DAG and stable branch shapes", () => {
    setRuntimeHooks((node) => runWatcher(node));

    const source = createProducer(1);
    const left = createConsumer(() => readProducer(source) + 1);
    const right = createConsumer(() => readProducer(source) + 2);
    const join = createConsumer(() => readConsumer(left) * readConsumer(right));
    const top = createConsumer(() => readConsumer(join) + readConsumer(left));

    let observed = 0;
    const sink = createWatcher(() => {
      observed = readConsumer(top);
    });

    runWatcher(sink);
    expect(observed).toBe(8);

    const plan = createStaticTransitionPlan([source]);

    expect(plan.nodes).toEqual([left, right, join, top]);
    expect(writeStaticPlanSource(plan, source, 3)).toBe(true);
    expect(observed).toBe(24);
  });

  it("executes only the source range for independent partitions", () => {
    setRuntimeHooks((node) => runWatcher(node));

    const leftSource = createProducer(1);
    const rightSource = createProducer(10);
    let leftRuns = 0;
    let rightRuns = 0;

    const left = createConsumer(() => {
      leftRuns += 1;
      return readProducer(leftSource) + 1;
    });
    const right = createConsumer(() => {
      rightRuns += 1;
      return readProducer(rightSource) + 1;
    });

    let leftObserved = 0;
    let rightObserved = 0;
    const leftSink = createWatcher(() => {
      leftObserved = readConsumer(left);
    });
    const rightSink = createWatcher(() => {
      rightObserved = readConsumer(right);
    });

    runWatcher(leftSink);
    runWatcher(rightSink);

    const plan = createStaticTransitionPlan([leftSource, rightSource]);

    expect(plan.ranges).toHaveLength(2);
    expect(writeStaticPlanSource(plan, leftSource, 2)).toBe(true);

    expect(leftObserved).toBe(3);
    expect(rightObserved).toBe(11);
    expect(leftRuns).toBe(2);
    expect(rightRuns).toBe(1);
  });
});
