class Runtime {
  readonly layout: ICausalLayout;
  readonly graph: IGraph;
  readonly scheduler: IScheduler;

  constructor(layoutCapacity: number, graph: IGraph, scheduler: IScheduler) {
    this.layout.alloc(layoutCapacity);
    this.graph = graph;
    this.scheduler = scheduler;
  }

  createGraphNode() {}
}

export default Runtime;

// const AppRuntime = createReactiveRuntime();
// const WorkerRuntime = createReactiveRuntime();

// AppRuntime.beginComputation(myReaction);
// AppRuntime.track(signalA);
// AppRuntime.endComputation();

// // worker работает независимо
// WorkerRuntime.beginComputation(otherReaction);
// WorkerRuntime.track(signalB);
// // WorkerRuntime.endComputation();
