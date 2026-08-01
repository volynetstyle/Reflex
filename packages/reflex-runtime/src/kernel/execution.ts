export const RuntimePhase = {
  Idle: 0,
  Propagating: 1,
  Pulling: 2,
  Recomputing: 3,
  WatcherExecution: 4,
} as const;

export type RuntimePhase = (typeof RuntimePhase)[keyof typeof RuntimePhase];

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
const runtimeHookStack: Array<string | null> = [];
let runtimeHookDepth = 0;

export function enterRuntimePhase(phase: RuntimePhase): void {
  if (!SCHEDULER_POLICY_ENABLED) return;

  if (phase === RuntimePhase.Pulling) {
    assertCurrentPhaseIsNot(
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

  runtimeHookStack[runtimeHookDepth++] = activeRuntimeHook;
  activeRuntimeHook = name;
}

export function leaveRuntimeHook(): void {
  if (!SCHEDULER_POLICY_ENABLED) return;

  if (runtimeHookDepth === 0) {
    activeRuntimeHook = null;
    return;
  }

  activeRuntimeHook = runtimeHookStack[--runtimeHookDepth] ?? null;
  runtimeHookStack.length = runtimeHookDepth;
}

export function readActiveRuntimeHook(): string | null {
  return activeRuntimeHook;
}

export function devAssertNoRuntimeHookWatcherExecution(): void {
  if (!SCHEDULER_POLICY_ENABLED || activeRuntimeHook !== "onNodeInvalidated") {
    return;
  }

  throw new Error(
    [
      "[REFLEX_SCHEDULER_REENTRANT_FLUSH]",
      "",
      "Host scheduler executed runWatcher() synchronously from onNodeInvalidated.",
      "",
      "Invalidation hooks must enqueue work and return before executing watchers.",
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
  if (!SCHEDULER_POLICY_ENABLED || activeRuntimeHook !== "onNodeInvalidated") {
    return;
  }

  throw new Error(
    [
      "[REFLEX_SCHEDULER_REACTIVE_READ_IN_HOOK]",
      "",
      "Host scheduler performed a reactive read from onNodeInvalidated.",
      "",
      "Invalidation hooks must not read reactive graph state.",
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
  runtimeHookDepth = 0;
  runtimeHookStack.length = 0;
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

function assertCurrentPhaseIsNot(
  phase: RuntimePhase,
  code: string,
  message: string,
): void {
  if (
    runtimeExecutionState.phase !== phase ||
    runtimeExecutionState.depth === 0
  ) {
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
