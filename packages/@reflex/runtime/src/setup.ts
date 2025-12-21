import { Runtime } from "./execution/runtime.contract";
import { RuntimeServicesMap } from "./execution/runtime.services";
/** Services */
import { GraphService } from "@reflex/core";

interface RuntimeServices extends RuntimeServicesMap {
  graph: GraphService;
}

const createRuntime = () =>
  new Runtime<RuntimeServices>({
    graph: new GraphService(),
  });

export { createRuntime, type RuntimeServices };
