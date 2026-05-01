import { readConsumer, readProducer } from "../../src";
import { createConsumer, createProducer, createWatcher } from "./node-factory";

export type LinearChainOptions = {
  length: number;
  source?: number;
  step?: (value: number, index: number) => number;
};

export type DiamondOptions = {
  source?: number;
  shared?: (value: number) => number;
  left?: (value: number) => number;
  right?: (value: number) => number;
  sink?: (left: number, right: number) => number;
};

export type BranchSwitchOptions = {
  gate?: boolean;
  left?: number;
  right?: number;
};

export function linearChain(
  optionsOrLength: LinearChainOptions | number,
  initial = 0,
) {
  const options =
    typeof optionsOrLength === "number"
      ? { length: optionsOrLength, source: initial }
      : optionsOrLength;
  const step = options.step ?? ((value: number) => value + 1);
  const source = createProducer(options.source ?? 0);
  const consumers = [];
  let current = createConsumer(() => step(readProducer(source), 0));
  consumers.push(current);

  for (let index = 1; index < options.length; index += 1) {
    const previous = current;
    current = createConsumer(() => step(readConsumer(previous), index));
    consumers.push(current);
  }

  return {
    source,
    consumers,
    root: current,
  };
}

export function diamond(optionsOrInitial: DiamondOptions | number = {}) {
  const options =
    typeof optionsOrInitial === "number"
      ? { source: optionsOrInitial }
      : optionsOrInitial;
  const sharedCompute = options.shared ?? ((value: number) => value * 2);
  const leftCompute = options.left ?? ((value: number) => value + 1);
  const rightCompute = options.right ?? ((value: number) => value + 2);
  const sinkCompute = options.sink ?? ((left: number, right: number) => left + right);
  const source = createProducer(options.source ?? 1);
  const shared = createConsumer(() => sharedCompute(readProducer(source)));
  const left = createConsumer(() => leftCompute(readConsumer(shared)));
  const right = createConsumer(() => rightCompute(readConsumer(shared)));
  const sink = createConsumer(() =>
    sinkCompute(readConsumer(left), readConsumer(right)),
  );

  return {
    source,
    shared,
    left,
    right,
    sink,
    nodes: [source, shared, left, right, sink],
  };
}

export function branchSwitch(
  optionsOrGate: BranchSwitchOptions | boolean = {},
  leftValue = 1,
  rightValue = 10,
) {
  const options =
    typeof optionsOrGate === "boolean"
      ? { gate: optionsOrGate, left: leftValue, right: rightValue }
      : optionsOrGate;
  const gate = createProducer(options.gate ?? true);
  const left = createProducer(options.left ?? 1);
  const right = createProducer(options.right ?? 10);
  const selected = createConsumer(() =>
    readProducer(gate) ? readProducer(left) : readProducer(right),
  );

  return {
    gate,
    left,
    right,
    selected,
    nodes: [gate, left, right, selected],
  };
}

export function watcherFanout(count: number, initial = 1) {
  const source = createProducer(initial);
  const watchers = Array.from({ length: count }, () =>
    createWatcher(() => {
      readProducer(source);
    }),
  );

  return {
    source,
    watchers,
    nodes: [source, ...watchers],
  };
}

export const scenario = {
  branchSwitch,
  diamond,
  linearChain,
  watcherFanout,
};
