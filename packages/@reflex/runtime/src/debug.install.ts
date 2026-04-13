import {
  clearDebugHistory,
  collectDebugNodeRefs,
  configureDebugContext,
  labelDebugNode,
  observeDebugContext,
  readDebugHistory,
  recordDebugEvent,
  snapshotDebugContext,
  snapshotDebugNode,
} from "./debug.impl";
import { installRuntimeDebug } from "./debug.runtime";

installRuntimeDebug({
  clearDebugHistory,
  collectDebugNodeRefs,
  configureDebugContext,
  labelDebugNode,
  observeDebugContext,
  readDebugHistory,
  recordDebugEvent,
  snapshotDebugContext,
  snapshotDebugNode,
});

export const runtimeDebugInstalled = true;
