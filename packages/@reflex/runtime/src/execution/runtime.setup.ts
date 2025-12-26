/** @internal */
import { createExtension, Runtime } from "./runtime.contract";
/** Services */
import { GraphService } from "@reflex/core";
import { Environment } from "./runtime.services";

// interface RuntimeEnvironment extends Environment {
//   graph: GraphService;
// }

// const createRuntime = (identifier: symbol) => ({
//   identifier: identifier,
//   runtime: new Runtime<RuntimeEnvironment>({
//     graph: new GraphService(),
//   }),
// });

// export { createRuntime, type RuntimeEnvironment };

const ReactiveCapability = Symbol("reactive");

export type ReactiveEnvironment = {
  reactive: {
    beginComputation(): void;
    track(signal: unknown): void;
    endComputation(): void;
  };
};

const runtime: Runtime<{
  graph: GraphService;
}> = new Runtime({
  graph: new GraphService(),
});

const createReactive = createExtension<ReactiveEnvironment>({
  install(env) {
    env.reactive = {
      beginComputation() {},
      track() {},
      endComputation() {},
    };
  },
});

runtime.env.graph.addObserver;

runtime.use(createReactive());

runtime.env.reactive.track;

// runtime.env[GraphCapability].addObserver(); // ✅ OK

// // runtime.env[ReactiveCapability] ❌ нет

// runtime.use(createReactive());

// runtime.env[ReactiveCapability].beginComputation(); // ✅ ts знает
// runtime.env[ReactiveCapability].track("signal");
// runtime.env[ReactiveCapability].endComputation();
