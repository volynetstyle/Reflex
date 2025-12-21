/** @internal */
import { Runtime } from "./runtime.contract";
/** Services */
import { GraphService } from "@reflex/core";
import { Environment } from "./runtime.services";
    
interface RuntimeEnvironment extends Environment {
  graph: GraphService;
}

const createRuntime = (identifier: symbol) => ({
  identifier: identifier,
  RUNTIME: new Runtime<RuntimeEnvironment>({
    graph: new GraphService(),
  }),
});

export { createRuntime, type RuntimeEnvironment };
