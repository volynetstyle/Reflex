import "./debug_flag";
import { runtimeDebugInstalled } from "./debug.install";

void runtimeDebugInstalled;

export * from "./index";
export { subtle, type RuntimeSubtle } from "./subtle";
export type {
  RuntimeDebugContextSnapshot,
  RuntimeDebugEvent,
  RuntimeDebugEventType,
  RuntimeDebugFlag,
  RuntimeDebugDirtyState,
  RuntimeDebugListener,
  RuntimeDebugNodeKind,
  RuntimeDebugNodeRef,
  RuntimeDebugNodeSnapshot,
  RuntimeDebugOptions,
} from "./debug.types";
