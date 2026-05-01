export function createRuntimeFixtures(runtime) {
  const {
    CONSUMER_INITIAL_STATE,
    PRODUCER_INITIAL_STATE,
    ReactiveNode,
    WATCHER_INITIAL_STATE,
    readConsumer,
    readProducer,
  } = runtime;

  function createProducer(value) {
    return new ReactiveNode(value, null, PRODUCER_INITIAL_STATE);
  }

  function createConsumer(compute) {
    return new ReactiveNode(undefined, compute, CONSUMER_INITIAL_STATE);
  }

  function createWatcher(compute) {
    return new ReactiveNode(null, compute, WATCHER_INITIAL_STATE);
  }

  function branchSwitch(options = {}) {
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

  function diamond(options = {}) {
    const sharedCompute = options.shared ?? ((value) => value * 2);
    const leftCompute = options.left ?? ((value) => value + 1);
    const rightCompute = options.right ?? ((value) => value + 2);
    const sinkCompute = options.sink ?? ((left, right) => left + right);
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

  return {
    branchSwitch,
    createConsumer,
    createProducer,
    createWatcher,
    diamond,
  };
}
