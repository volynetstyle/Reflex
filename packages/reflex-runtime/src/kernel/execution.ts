export enum RuntimePhase {
  Idle,
  Propagating,
  Pulling,
  Recomputing,
  WatcherExecution,
}

export interface RuntimeExecutionState {
  phase: RuntimePhase;
  depth: number;
}

const runtimeExecutionState: RuntimeExecutionState = {
  phase: RuntimePhase.Idle,
  depth: 0,
};

const SCHEDULER_POLICY_ENABLED =
  typeof __DEV__ !== "undefined" &&
  __DEV__ &&
  typeof __PROFILE__ !== "undefined" &&
  __PROFILE__;

const phaseStack: RuntimePhase[] = [];
let activeRuntimeHook: string | null = null;

export function enterRuntimePhase(phase: RuntimePhase): void {
  if (!SCHEDULER_POLICY_ENABLED) return;

  if (phase === RuntimePhase.Pulling) {
    assertPhaseNotActive(
      RuntimePhase.Pulling,
      "REFLEX_NESTED_PULL",
      [
        "A reactive consumer attempted to start a pull walk while another pull walk was already active.",
        "",
        "This usually indicates:",
        "- synchronous effect execution",
        "- scheduler reentrancy",
        "- runtime hook misuse",
      ].join("\n"),
    );
  } else if (phase === RuntimePhase.Propagating) {
    assertPhaseNotActive(
      RuntimePhase.Propagating,
      "REFLEX_NESTED_PROPAGATION",
      "A reactive producer attempted to start propagation while another propagation walk was already active.",
    );
  }

  phaseStack[runtimeExecutionState.depth] = runtimeExecutionState.phase;
  runtimeExecutionState.phase = phase;
  runtimeExecutionState.depth++;
}

export function leaveRuntimePhase(): void {
  if (!SCHEDULER_POLICY_ENABLED) return;

  if (runtimeExecutionState.depth > 0) {
    runtimeExecutionState.depth--;
  }

  if (runtimeExecutionState.depth === 0) {
    runtimeExecutionState.phase = RuntimePhase.Idle;
    phaseStack.length = 0;
  } else {
    runtimeExecutionState.phase =
      phaseStack[runtimeExecutionState.depth] ?? RuntimePhase.Idle;
    phaseStack.length = runtimeExecutionState.depth;
  }
}

export function readRuntimePhase(): RuntimeExecutionState {
  return runtimeExecutionState;
}

export function enterRuntimeHook(name: string): void {
  if (!SCHEDULER_POLICY_ENABLED) return;
  activeRuntimeHook = name;
}

export function leaveRuntimeHook(): void {
  if (!SCHEDULER_POLICY_ENABLED) return;
  activeRuntimeHook = null;
}

export function readActiveRuntimeHook(): string | null {
  return activeRuntimeHook;
}

export function devAssertNoRuntimeHookWatcherExecution(): void {
  if (!SCHEDULER_POLICY_ENABLED || activeRuntimeHook === null) return;

  throw new Error(
    [
      "[REFLEX_SCHEDULER_REENTRANT_FLUSH]",
      "",
      `Host scheduler executed runWatcher() synchronously from ${activeRuntimeHook}.`,
      "",
      "Runtime hooks are notification points and must not directly execute watchers.",
      "",
      "Allowed:",
      "  enqueue watcher",
      "  schedule host flush",
      "",
      "Forbidden:",
      "  runWatcher(...)",
      "  readConsumer(...)",
      "  pull_iterator(...)",
    ].join("\n"),
  );
}

export function devAssertNoRuntimeHookReactiveRead(): void {
  if (!SCHEDULER_POLICY_ENABLED || activeRuntimeHook === null) return;

  throw new Error(
    [
      "[REFLEX_SCHEDULER_REACTIVE_READ_IN_HOOK]",
      "",
      `Host scheduler performed a reactive read from ${activeRuntimeHook}.`,
      "",
      "Runtime hooks are notification points and must not read reactive graph state.",
    ].join("\n"),
  );
}

export function devAssertRuntimeHookDidNotReenter(
  hookName: string,
  phaseBefore: RuntimePhase,
  depthBefore: number,
): void {
  if (!SCHEDULER_POLICY_ENABLED) return;

  if (
    runtimeExecutionState.phase === phaseBefore &&
    runtimeExecutionState.depth === depthBefore
  ) {
    return;
  }

  throw new Error(
    [
      "[REFLEX_HOST_HOOK_REENTERED_RUNTIME]",
      "",
      `Host hook ${hookName} changed runtime execution phase while it was running.`,
      "",
      "Runtime hooks must enqueue work and return before watchers or reactive reads execute.",
    ].join("\n"),
  );
}

export function resetRuntimeExecutionState(): void {
  runtimeExecutionState.phase = RuntimePhase.Idle;
  runtimeExecutionState.depth = 0;
  phaseStack.length = 0;
  activeRuntimeHook = null;
}

function assertPhaseNotActive(
  phase: RuntimePhase,
  code: string,
  message: string,
): void {
  if (!isPhaseActive(phase)) {
    return;
  }

  throw new Error(`[${code}]\n\n${message}`);
}

function isPhaseActive(phase: RuntimePhase): boolean {
  if (runtimeExecutionState.depth === 0) return false;
  if (runtimeExecutionState.phase === phase) return true;

  for (let i = runtimeExecutionState.depth - 1; i >= 0; i--) {
    if (phaseStack[i] === phase) return true;
  }

  return false;
}
