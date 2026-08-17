import type { FrameworkName, ReactiveBenchApi } from "../types.js";
import { createAlienApi } from "./alien.js";
import { createReflexApi } from "./reflex.js";

export function createApi(framework: FrameworkName): ReactiveBenchApi {
  return framework === "alien" ? createAlienApi() : createReflexApi();
}
