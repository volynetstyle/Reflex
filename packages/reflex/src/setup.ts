import { createRuntime as createRuntimeImpl } from "@reflex/runtime";
import type { Runtime } from "./public-types";

export const runtime: Runtime = createRuntimeImpl() as Runtime;
