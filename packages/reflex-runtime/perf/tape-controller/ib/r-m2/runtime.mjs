globalThis.__C ??= {};
// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/profiling.ts
function createTopologyWalker() {
  return {
    total: 0,
    maxDepth: 0,
    maxStack: 0,
    fanIn: {},
    fanOut: {},
    depth: {},
    branch: {},
    shape: {},
    hotPaths: []
  };
}
function createTopology() {
  return {
    push: createTopologyWalker(),
    pull: createTopologyWalker()
  };
}
var runtimeProfileTopology = createTopology();

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/debug/debug.runtime.ts
var collectDebugNodeRefsImpl = () => [];
var recordDebugEventImpl = () => void 0;
function collectDebugNodeRefs(edge, selectNode, next) {
  return collectDebugNodeRefsImpl(edge, selectNode, next);
}
function recordDebugEvent(context, type, input = {}) {
  return recordDebugEventImpl(context, type, input);
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/execution.ts
var RuntimePhase = {
  Idle: 0,
  Propagating: 1,
  Pulling: 2,
  Recomputing: 3,
  WatcherExecution: 4
};
var RuntimeExecutionError = {
  NestedPull: {
    code: "REFLEX_NESTED_PULL",
    message: [
      "A reactive consumer attempted to start a pull walk while another pull walk was already active.",
      "",
      "This usually indicates:",
      "- synchronous effect execution",
      "- scheduler reentrancy",
      "- runtime hook misuse"
    ].join("\n")
  },
  NestedPropagation: {
    code: "REFLEX_NESTED_PROPAGATION",
    message: "A reactive producer attempted to start propagation while another propagation walk was already active."
  },
  SchedulerReentrantFlush: {
    code: "REFLEX_SCHEDULER_REENTRANT_FLUSH",
    message: [
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
      "  pull_dependency(...)"
    ].join("\n")
  },
  SchedulerReactiveReadInHook: {
    code: "REFLEX_SCHEDULER_REACTIVE_READ_IN_HOOK",
    message: [
      "Host scheduler performed a reactive read from onNodeInvalidated.",
      "",
      "Invalidation hooks must not read reactive graph state."
    ].join("\n")
  },
  SchedulerTopologyMutationInHook: {
    code: "REFLEX_SCHEDULER_TOPOLOGY_MUTATION_IN_HOOK",
    message: [
      "Host scheduler attempted to dispose a watcher from onNodeInvalidated.",
      "",
      "Invalidation hooks must only enqueue work and return.",
      "Schedule disposal from onRuntimeIdle or another host boundary."
    ].join("\n")
  },
  HostHookReenteredRuntime: {
    code: "REFLEX_HOST_HOOK_REENTERED_RUNTIME"
  },
  RecomputeDepthExceeded: {
    code: "REFLEX_RECOMPUTE_DEPTH_EXCEEDED",
    message: "Reactive computation depth exceeded the development safety limit."
  }
};
var runtimeExecutionState = {
  phase: RuntimePhase.Idle,
  depth: 0
};
var SCHEDULER_POLICY_ENABLED = false;
var phaseStack = [];
var activeRuntimeHook = null;
var runtimeHookStack = [];
var runtimeHookDepth = 0;
var MAX_RECOMPUTE_DEPTH = 1024;
var recomputeDepth = 0;
function enterRuntimePhase(phase) {
  if (!SCHEDULER_POLICY_ENABLED) return;
  if (phase === RuntimePhase.Pulling) {
    assertCurrentPhaseIsNot(
      RuntimePhase.Pulling,
      RuntimeExecutionError.NestedPull
    );
  } else if (phase === RuntimePhase.Propagating) {
    assertPhaseNotActive(
      RuntimePhase.Propagating,
      RuntimeExecutionError.NestedPropagation
    );
  } else if (phase === RuntimePhase.Recomputing) {
    if (recomputeDepth >= MAX_RECOMPUTE_DEPTH) {
      const error = RuntimeExecutionError.RecomputeDepthExceeded;
      throw new Error(`${error.code}: ${error.message}`);
    }
    recomputeDepth += 1;
  }
  phaseStack[runtimeExecutionState.depth] = runtimeExecutionState.phase;
  runtimeExecutionState.phase = phase;
  runtimeExecutionState.depth++;
}
function leaveRuntimePhase() {
  if (!SCHEDULER_POLICY_ENABLED) return;
  if (runtimeExecutionState.phase === RuntimePhase.Recomputing) {
    recomputeDepth -= 1;
  }
  if (runtimeExecutionState.depth > 0) {
    runtimeExecutionState.depth--;
  }
  if (runtimeExecutionState.depth === 0) {
    runtimeExecutionState.phase = RuntimePhase.Idle;
    phaseStack.length = 0;
  } else {
    runtimeExecutionState.phase = phaseStack[runtimeExecutionState.depth] ?? RuntimePhase.Idle;
    phaseStack.length = runtimeExecutionState.depth;
  }
}
function readRuntimePhase() {
  return runtimeExecutionState;
}
function enterRuntimeHook(name) {
  if (!SCHEDULER_POLICY_ENABLED) return;
  runtimeHookStack[runtimeHookDepth++] = activeRuntimeHook;
  activeRuntimeHook = name;
}
function leaveRuntimeHook() {
  if (!SCHEDULER_POLICY_ENABLED) return;
  if (runtimeHookDepth === 0) {
    activeRuntimeHook = null;
    return;
  }
  activeRuntimeHook = runtimeHookStack[--runtimeHookDepth] ?? null;
  runtimeHookStack.length = runtimeHookDepth;
}
function readActiveRuntimeHook() {
  return activeRuntimeHook;
}
function devAssertNoRuntimeHookWatcherExecution() {
  if (!SCHEDULER_POLICY_ENABLED || activeRuntimeHook !== "onNodeInvalidated") {
    return;
  }
  throwRuntimeExecutionError(RuntimeExecutionError.SchedulerReentrantFlush);
}
function devAssertNoRuntimeHookReactiveRead() {
  if (!SCHEDULER_POLICY_ENABLED || activeRuntimeHook !== "onNodeInvalidated") {
    return;
  }
  throwRuntimeExecutionError(RuntimeExecutionError.SchedulerReactiveReadInHook);
}
function devAssertNoRuntimeHookTopologyMutation() {
  if (!SCHEDULER_POLICY_ENABLED || activeRuntimeHook !== "onNodeInvalidated") {
    return;
  }
  throwRuntimeExecutionError(
    RuntimeExecutionError.SchedulerTopologyMutationInHook
  );
}
function devAssertRuntimeHookDidNotReenter(hookName, phaseBefore, depthBefore) {
  if (!SCHEDULER_POLICY_ENABLED) return;
  if (runtimeExecutionState.phase === phaseBefore && runtimeExecutionState.depth === depthBefore) {
    return;
  }
  throwRuntimeExecutionError({
    code: RuntimeExecutionError.HostHookReenteredRuntime.code,
    message: [
      `Host hook ${hookName} changed runtime execution phase while it was running.`,
      "",
      "Runtime hooks must enqueue work and return before watchers or reactive reads execute."
    ].join("\n")
  });
}
var RUNTIME_EXECUTION_FRAMES_ENABLED = SCHEDULER_POLICY_ENABLED;
function saveRuntimeExecutionFrame() {
  if (!SCHEDULER_POLICY_ENABLED) return null;
  if (runtimeExecutionState.depth === 0 && runtimeHookDepth === 0 && activeRuntimeHook === null && recomputeDepth === 0) {
    return null;
  }
  return {
    phase: runtimeExecutionState.phase,
    phases: phaseStack.slice(0, runtimeExecutionState.depth),
    hook: activeRuntimeHook,
    hooks: runtimeHookStack.slice(0, runtimeHookDepth),
    recomputeDepth
  };
}
function loadRuntimeExecutionFrame(frame) {
  if (!SCHEDULER_POLICY_ENABLED) return;
  if (frame === null) {
    resetRuntimeExecutionState();
    return;
  }
  runtimeExecutionState.phase = frame.phase;
  runtimeExecutionState.depth = frame.phases.length;
  phaseStack.length = 0;
  phaseStack.push(...frame.phases);
  activeRuntimeHook = frame.hook;
  runtimeHookDepth = frame.hooks.length;
  runtimeHookStack.length = 0;
  runtimeHookStack.push(...frame.hooks);
  recomputeDepth = frame.recomputeDepth;
}
function resetRuntimeExecutionState() {
  runtimeExecutionState.phase = RuntimePhase.Idle;
  runtimeExecutionState.depth = 0;
  recomputeDepth = 0;
  phaseStack.length = 0;
  activeRuntimeHook = null;
  runtimeHookDepth = 0;
  runtimeHookStack.length = 0;
}
function assertPhaseNotActive(phase, error) {
  if (!isPhaseActive(phase)) {
    return;
  }
  throwRuntimeExecutionError(error);
}
function assertCurrentPhaseIsNot(phase, error) {
  if (runtimeExecutionState.phase !== phase || runtimeExecutionState.depth === 0) {
    return;
  }
  throwRuntimeExecutionError(error);
}
function throwRuntimeExecutionError(error) {
  throw new Error(`[${error.code}]

${error.message}`);
}
function isPhaseActive(phase) {
  if (runtimeExecutionState.depth === 0) return false;
  if (runtimeExecutionState.phase === phase) return true;
  for (let i = runtimeExecutionState.depth - 1; i >= 0; i--) {
    if (phaseStack[i] === phase) return true;
  }
  return false;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/state.ts
var RuntimeState = /* @__PURE__ */ ((RuntimeState2) => {
  RuntimeState2[RuntimeState2["Idle"] = 0] = "Idle";
  RuntimeState2[RuntimeState2["Tracking"] = 1] = "Tracking";
  RuntimeState2[RuntimeState2["Propagating"] = 2] = "Propagating";
  RuntimeState2[RuntimeState2["Batching"] = 4] = "Batching";
  RuntimeState2[RuntimeState2["IdlePending"] = 8] = "IdlePending";
  RuntimeState2[RuntimeState2["HostWorkPending"] = 16] = "HostWorkPending";
  return RuntimeState2;
})(RuntimeState || {});
var EXECUTION_ACTIVE = 1 /* Tracking */ | 2 /* Propagating */;
var runtimeState = 0 /* Idle */;
function setRuntimeState(state) {
  runtimeState = state;
}
function setRuntimeStateFlag(flag, enabled) {
  runtimeState = enabled === true ? runtimeState | flag : runtimeState & ~flag;
}
var currentConsumer = null;
function setCurrentConsumer(consumer) {
  currentConsumer = consumer;
  setRuntimeStateFlag(1 /* Tracking */, consumer !== null);
}
function enterConsumerTracking(consumer) {
  const previousConsumer = currentConsumer;
  currentConsumer = consumer;
  runtimeState |= 1 /* Tracking */;
  trackingStamp++;
  return previousConsumer;
}
function restoreConsumerTracking(previousConsumer) {
  currentConsumer = previousConsumer;
  if (previousConsumer === null) {
    runtimeState &= ~1 /* Tracking */;
  } else {
    runtimeState |= 1 /* Tracking */;
  }
}
var trackingStamp = 0;
function setTrackingStamp(epoch) {
  if (epoch > trackingStamp) trackingStamp = epoch;
}
function advanceTrackingStamp() {
  return ++trackingStamp;
}
function keepNewestTrackingStamp(epoch) {
  if (epoch > trackingStamp) trackingStamp = epoch;
}
function isNewerEpoch(a, b) {
  return a > b;
}
var propagationScopeDepth = 0;
function setPropagationScopeDepth(depth) {
  propagationScopeDepth = depth < 0 ? 0 : depth;
  setRuntimeStateFlag(2 /* Propagating */, propagationScopeDepth !== 0);
}
function enterPropagationScopeRegister() {
  propagationScopeDepth++;
  runtimeState |= 2 /* Propagating */;
}
function leavePropagationScopeRegister() {
  if (propagationScopeDepth > 0) {
    propagationScopeDepth--;
  }
  if (propagationScopeDepth === 0) {
    runtimeState &= ~2 /* Propagating */;
  }
  return (runtimeState & EXECUTION_ACTIVE) === 0 /* Idle */;
}
function isRuntimeExecutionIdle() {
  return (runtimeState & EXECUTION_ACTIVE) === 0 /* Idle */;
}
var reactiveBatchDepth = 0;
function enterReactiveBatchRegister() {
  ++reactiveBatchDepth;
  runtimeState |= 4 /* Batching */;
}
function leaveReactiveBatchRegister() {
  if (reactiveBatchDepth > 0) {
    --reactiveBatchDepth;
  }
  if (reactiveBatchDepth === 0) {
    runtimeState &= ~4 /* Batching */;
  }
  return reactiveBatchDepth === 0;
}
function markRuntimeIdlePending() {
  setRuntimeStateFlag(8 /* IdlePending */, true);
}
function clearRuntimeIdlePending() {
  setRuntimeStateFlag(8 /* IdlePending */, false);
}
function markHostWorkPending() {
  runtimeState |= 16 /* HostWorkPending */;
}
function clearHostWorkPending() {
  runtimeState &= ~16 /* HostWorkPending */;
}
function setReactiveBatchState(batchDepth, state) {
  reactiveBatchDepth = batchDepth < 0 ? 0 : batchDepth;
  setRuntimeState(state);
}
function isReactiveBatchActive() {
  return (runtimeState & 4 /* Batching */) !== 0 /* Idle */;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/graph/edgeList.ts
function moveIncomingEdgeAfterUnchecked(consumer, movedEdge, insertAfterEdge) {
  if (movedEdge === insertAfterEdge || movedEdge.prevIn === insertAfterEdge)
    return;
  const previousIncomingEdge = movedEdge.prevIn;
  const nextIncomingEdge = movedEdge.nextIn;
  if (previousIncomingEdge !== null)
    previousIncomingEdge.nextIn = nextIncomingEdge;
  else consumer.firstIn = nextIncomingEdge;
  if (nextIncomingEdge !== null) nextIncomingEdge.prevIn = previousIncomingEdge;
  else consumer.lastIn = previousIncomingEdge;
  const nextEdgeAtInsertion = insertAfterEdge !== null ? insertAfterEdge.nextIn : consumer.firstIn;
  movedEdge.prevIn = insertAfterEdge;
  movedEdge.nextIn = nextEdgeAtInsertion;
  if (nextEdgeAtInsertion !== null) nextEdgeAtInsertion.prevIn = movedEdge;
  else consumer.lastIn = movedEdge;
  if (insertAfterEdge !== null) insertAfterEdge.nextIn = movedEdge;
  else consumer.firstIn = movedEdge;
}
function moveMiddleIncomingEdgeAfterEdgeUnchecked(consumer, movedEdge, insertAfterEdge) {
  const previousIncomingEdge = movedEdge.prevIn;
  const nextIncomingEdge = movedEdge.nextIn;
  previousIncomingEdge.nextIn = nextIncomingEdge;
  nextIncomingEdge.prevIn = previousIncomingEdge;
  const nextEdgeAtInsertion = insertAfterEdge.nextIn;
  movedEdge.prevIn = insertAfterEdge;
  movedEdge.nextIn = nextEdgeAtInsertion;
  if (nextEdgeAtInsertion !== null) nextEdgeAtInsertion.prevIn = movedEdge;
  else consumer.lastIn = movedEdge;
  insertAfterEdge.nextIn = movedEdge;
}
function moveNonHeadIncomingEdgeToFrontUnchecked(consumer, movedEdge) {
  const previousIncomingEdge = movedEdge.prevIn;
  const nextIncomingEdge = movedEdge.nextIn;
  previousIncomingEdge.nextIn = nextIncomingEdge;
  if (nextIncomingEdge !== null) nextIncomingEdge.prevIn = previousIncomingEdge;
  else consumer.lastIn = previousIncomingEdge;
  const firstIncomingEdge = consumer.firstIn;
  movedEdge.prevIn = null;
  movedEdge.nextIn = firstIncomingEdge;
  firstIncomingEdge.prevIn = movedEdge;
  consumer.firstIn = movedEdge;
}
function moveLastIncomingEdgeToFrontUnchecked(consumer, lastIncomingEdge) {
  const previousLastEdge = lastIncomingEdge.prevIn;
  previousLastEdge.nextIn = null;
  consumer.lastIn = previousLastEdge;
  const firstIncomingEdge = consumer.firstIn;
  lastIncomingEdge.prevIn = null;
  lastIncomingEdge.nextIn = firstIncomingEdge;
  firstIncomingEdge.prevIn = lastIncomingEdge;
  consumer.firstIn = lastIncomingEdge;
}
function moveLastIncomingEdgeAfterEdgeUnchecked(consumer, movedEdge, insertAfterEdge) {
  if (movedEdge.prevIn === insertAfterEdge) return;
  const previousIncomingEdge = movedEdge.prevIn;
  previousIncomingEdge.nextIn = null;
  consumer.lastIn = previousIncomingEdge;
  const nextEdgeAtInsertion = insertAfterEdge.nextIn;
  movedEdge.prevIn = insertAfterEdge;
  movedEdge.nextIn = nextEdgeAtInsertion;
  nextEdgeAtInsertion.prevIn = movedEdge;
  insertAfterEdge.nextIn = movedEdge;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/meta.ts
var None = 0;
var Unknown = 1 << 0;
var Changed = 1 << 1;
var Both = Unknown | Changed;
var Visited = 1 << 2;
var Computing = 1 << 3;
var Watcher = 1 << 4;
var Scheduled = 1 << 5;
var Disposed = 1 << 6;
var WatcherCleanupPending = 1 << 7;
var Revalidate = 1 << 8;
var Leased = 1 << 9;
var Producer = false ? 1 << 29 : 0;
var Consumer = false ? 1 << 30 : 0;
var PRODUCER_INITIAL_STATE = Producer;
var CONSUMER_INITIAL_STATE = Changed | Consumer;
var WATCHER_INITIAL_STATE = Both | Watcher | Consumer;

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/graph/tape.ts
var preparedOwner = null;
var preparedPassStamp = 0;
var hasFullTapeCoverage = false;
var lastStrikeConsumer = null;
var lastStrikePassStamp = 0;
function getTrackingPassStamp(consumer) {
  const cursorEdge = consumer.tailIn;
  return cursorEdge !== null ? cursorEdge.stamp : trackingStamp;
}
function isLeaseLive(owner) {
  return (owner.state & Computing) !== 0 && getTrackingPassStamp(owner) === preparedPassStamp;
}
function releaseLease(owner) {
  for (let incomingEdge = owner.firstIn; incomingEdge !== null; incomingEdge = incomingEdge.nextIn) {
    incomingEdge.from.state &= ~Leased;
  }
  preparedOwner = null;
}
function preparedMissIsAbsent(producer, consumer) {
  if (isLeaseLive(consumer) === false) {
    releaseLease(consumer);
    return false;
  }
  return hasFullTapeCoverage && (producer.state & (Computing | Watcher | Leased)) === 0 && producer !== consumer;
}
function settleOnPreparedTape(producer, consumer) {
  if (preparedOwner === consumer) {
    return preparedMissIsAbsent(producer, consumer) === true ? null : void 0;
  }
  if (recordStrikeAndMaybePrepareTape(consumer) === false) return void 0;
  const slotEdge = producer.tailIn;
  if (slotEdge !== null && slotEdge.to === consumer && slotEdge.from === producer) {
    return slotEdge;
  }
  return preparedMissIsAbsent(producer, consumer) === true ? null : void 0;
}
function strikeOnFarFingerHit(edge, consumer) { __C.farHit++;
  if ((consumer.state & Computing) !== 0)
    void recordStrikeAndMaybePrepareTape(consumer);
  return edge;
}
function recordStrikeAndMaybePrepareTape(consumer) { __C.strike++;
  const passStamp = getTrackingPassStamp(consumer);
  if (lastStrikeConsumer !== consumer || lastStrikePassStamp !== passStamp) {
    lastStrikeConsumer = consumer;
    lastStrikePassStamp = passStamp;
    return false;
  }
  const currentOwner = preparedOwner;
  if (currentOwner !== null) {
    if (currentOwner === consumer && preparedPassStamp === passStamp)
      return false;
    if (isLeaseLive(currentOwner) === true) return false;
    releaseLease(currentOwner);
  }
  prepareTape(consumer, passStamp);
  return true;
}
function prepareTape(consumer, passStamp) { __C.prep++; __C.prepScan += (() => { let n = 0; for (let e = consumer.firstIn; e; e = e.nextIn) n++; return n; })();
  let allProducersCovered = true;
  for (let incomingEdge = consumer.firstIn; incomingEdge !== null; incomingEdge = incomingEdge.nextIn) {
    const producer = incomingEdge.from;
    const producerState = producer.state;
    if ((producerState & (Computing | Watcher)) === 0) {
      producer.state = producerState | Leased;
      producer.tailIn = incomingEdge;
    } else {
      allProducersCovered = false;
    }
  }
  preparedOwner = consumer;
  preparedPassStamp = passStamp;
  hasFullTapeCoverage = allProducersCovered;
}
function notePreparedLink(edge) {
  const producer = edge.from;
  const producerState = producer.state;
  if ((producerState & (Computing | Watcher)) === 0) {
    producer.state = producerState | Leased;
    producer.tailIn = edge;
  } else {
    hasFullTapeCoverage = false;
  }
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/graph/findEdge.ts
function findEdgeInLockstep(producer, consumer, back, ahead) { __C.lookup++;
  const hint = producer.tailIn;
  if (hint !== null && hint.to === consumer && hint.from === producer) {
    return hint;
  }
  let out = producer.firstOut;
  if (out === null) return null;
  __C["step:findEdgeInLockstep"] = (__C["step:findEdgeInLockstep"] ?? 0) + 1; if (false)
    observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
  if (out.to === consumer) return out;
  out = out.nextOut;
  if (out === null) return null;
  __C["step:findEdgeInLockstep"] = (__C["step:findEdgeInLockstep"] ?? 0) + 1; if (false)
    observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
  if (out.to === consumer) return out;
  out = out.nextOut;
  if (out === null) return null;
  const edge = hint !== null && hint.from === producer ? findEdgeInLockstepFromFinger(producer, consumer, hint, out, back, ahead) : findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead);
  if (edge !== null && (producer.state & (Computing | Watcher)) === 0) {
    producer.tailIn = edge;
  }
  return edge;
}
var FAR_FINGER_ROUND = 6;
function findEdgeInLockstepFromFinger(producer, consumer, finger, out, back, ahead) { __C.finger++; if (preparedOwner !== null && finger.to === preparedOwner) __C.foreignCell++;
  if (preparedOwner === consumer && preparedMissIsAbsent(producer, consumer) === true) {
    return null;
  }
  let after = finger.nextOut ?? producer.firstOut;
  let before = finger.prevOut ?? producer.lastOut;
  for (let round = 0; round < FAR_FINGER_ROUND; round++) {
    {
      __C["step:findEdgeInLockstepFromFinger"] = (__C["step:findEdgeInLockstepFromFinger"] ?? 0) + 1; if (false)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
    }
    if ((round & 1) === 0) {
      if (after.to === consumer) {
        return after;
      }
      after = after.nextOut ?? producer.firstOut;
    } else {
      if (before.to === consumer) {
        return before;
      }
      before = before.prevOut ?? producer.lastOut;
    }
    {
      __C["step:findEdgeInLockstepFromFinger"] = (__C["step:findEdgeInLockstepFromFinger"] ?? 0) + 1; if (false)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
    }
    if (out === null) {
      return null;
    }
    if (out.to === consumer) {
      return out;
    }
    out = out.nextOut;
    if (out === null) {
      return null;
    }
    if (back !== null) {
      {
        if (false)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step"
          );
      }
      if (back.from === producer) {
        return back;
      }
      back = back.prevIn;
    }
    if (ahead !== null) {
      {
        if (false)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step"
          );
      }
      if (ahead.from === producer) {
        return ahead;
      }
      ahead = ahead.nextIn;
    } else if (back === null) {
      return null;
    }
  }
  return findEdgeInLockstepFarFinger(
    producer,
    consumer,
    after,
    before,
    out,
    back,
    ahead
  );
}
function findEdgeInLockstepFarFinger(producer, consumer, after, before, out, back, ahead) {
  for (let round = FAR_FINGER_ROUND; round < 8; round++) {
    {
      __C["step:findEdgeInLockstepFarFinger"] = (__C["step:findEdgeInLockstepFarFinger"] ?? 0) + 1; if (false)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
    }
    if ((round & 1) === 0) {
      if (after.to === consumer) return strikeOnFarFingerHit(after, consumer);
    } else {
      if (before.to === consumer) return strikeOnFarFingerHit(before, consumer);
    }
    {
      __C["step:findEdgeInLockstepFarFinger"] = (__C["step:findEdgeInLockstepFarFinger"] ?? 0) + 1; if (false)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
    }
    if (out === null) return null;
    if (out.to === consumer) return strikeOnFarFingerHit(out, consumer);
    out = out.nextOut;
    if (out === null) return null;
    if (back !== null) {
      {
        if (false)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step"
          );
      }
      if (back.from === producer) return strikeOnFarFingerHit(back, consumer);
      back = back.prevIn;
    }
    if (ahead !== null) {
      {
        if (false)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step"
          );
      }
      if (ahead.from === producer) return strikeOnFarFingerHit(ahead, consumer);
      ahead = ahead.nextIn;
    } else if (back === null) {
      return null;
    }
  }
  return findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead);
}
function findEdgeInLockstepPastHeadStart(producer, consumer, out, back, ahead) { __C.plain++;
  if ((consumer.state & Computing) !== 0) {
    const settled = settleOnPreparedTape(producer, consumer);
    if (settled !== void 0) return settled;
  }
  while (out !== null) {
    {
      __C["step:findEdgeInLockstepPastHeadStart"] = (__C["step:findEdgeInLockstepPastHeadStart"] ?? 0) + 1; if (false)
        observeRuntimeProjection?.("projection.semantic.tracking.locate.step");
    }
    if (out.to === consumer) {
      return out;
    }
    out = out.nextOut;
    if (back !== null) {
      {
        if (false)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step"
          );
      }
      if (back.from === producer) {
        return back;
      }
      back = back.prevIn;
    }
    if (ahead !== null) {
      {
        if (false)
          observeRuntimeProjection?.(
            "projection.semantic.tracking.locate.step"
          );
      }
      if (ahead.from === producer) {
        return ahead;
      }
      ahead = ahead.nextIn;
    } else if (back === null) {
      return null;
    }
  }
  return null;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/graph/hint.ts
function isOutgoingHint(node, edge) {
  return edge.from === node && edge.to !== node;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/graph/linkEdge.ts
function linkEdge(from, to, after = to.lastIn, stamp = 0) {
  const prevOut = from.lastOut;
  const nextIn = after === null ? to.firstIn : after.nextIn;
  const edge = {
    stamp,
    from,
    to,
    prevOut,
    nextOut: null,
    prevIn: after,
    nextIn
  };
  if (prevOut === null) from.firstOut = edge;
  else prevOut.nextOut = edge;
  from.lastOut = edge;
  if (after === null) to.firstIn = edge;
  else after.nextIn = edge;
  if (nextIn === null) to.lastIn = edge;
  else nextIn.prevIn = edge;
  if (to === preparedOwner) notePreparedLink(edge);
  return edge;
}
function linkFirstTrackedEdgeUnchecked(from, to, stamp) {
  const prevOut = from.lastOut;
  const edge = {
    stamp,
    from,
    to,
    prevOut,
    nextOut: null,
    prevIn: null,
    nextIn: null
  };
  if (prevOut !== null) prevOut.nextOut = edge;
  else from.firstOut = edge;
  from.lastOut = edge;
  to.firstIn = to.lastIn = to.tailIn = edge;
  if (to === preparedOwner) notePreparedLink(edge);
  return edge;
}
function appendTrackedEdgeAfterCursorUnchecked(from, to, cursor, stamp) {
  const prevOut = from.lastOut;
  const edge = {
    stamp,
    from,
    to,
    prevOut,
    nextOut: null,
    prevIn: cursor,
    nextIn: null
  };
  if (prevOut !== null) prevOut.nextOut = edge;
  else from.firstOut = edge;
  from.lastOut = edge;
  cursor.nextIn = edge;
  to.lastIn = to.tailIn = edge;
  if (to === preparedOwner) notePreparedLink(edge);
  return edge;
}
function unlinkEdge(edge) {
  const { from, to, prevOut, nextOut, prevIn, nextIn } = edge;
  if (prevOut !== null) prevOut.nextOut = nextOut;
  else from.firstOut = nextOut;
  if (nextOut !== null) nextOut.prevOut = prevOut;
  else from.lastOut = prevOut;
  if (prevIn !== null) prevIn.nextIn = nextIn;
  else to.firstIn = nextIn;
  if (nextIn !== null) nextIn.prevIn = prevIn;
  else to.lastIn = prevIn;
  if (to.tailIn === edge) to.tailIn = prevIn;
  if (from.tailIn === edge) from.tailIn = null;
  edge.prevOut = null;
  edge.nextOut = null;
  edge.prevIn = null;
  edge.nextIn = null;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/graph/reuseEdge.ts
function moveSuffixEdgeAfterCursor(consumer, edge, insertAfterEdge) {
  const previousIncomingEdge = edge.prevIn;
  if (previousIncomingEdge === insertAfterEdge) return;
  if (false)
    observeRuntimeProjection2?.("projection.semantic.tracking.edge.move");
  const nextIncomingEdge = edge.nextIn;
  if (insertAfterEdge === null) {
    previousIncomingEdge.nextIn = nextIncomingEdge;
    if (nextIncomingEdge !== null)
      nextIncomingEdge.prevIn = previousIncomingEdge;
    else consumer.lastIn = previousIncomingEdge;
    const firstIncomingEdge = consumer.firstIn;
    edge.prevIn = null;
    edge.nextIn = firstIncomingEdge;
    firstIncomingEdge.prevIn = edge;
    consumer.firstIn = edge;
    return;
  }
  if (previousIncomingEdge === null && edge === insertAfterEdge) return;
  if (previousIncomingEdge !== null)
    previousIncomingEdge.nextIn = nextIncomingEdge;
  else consumer.firstIn = nextIncomingEdge;
  if (nextIncomingEdge !== null) nextIncomingEdge.prevIn = previousIncomingEdge;
  else consumer.lastIn = previousIncomingEdge;
  const nextEdgeAtInsertion = insertAfterEdge.nextIn;
  edge.prevIn = insertAfterEdge;
  edge.nextIn = nextEdgeAtInsertion;
  if (nextEdgeAtInsertion !== null) nextEdgeAtInsertion.prevIn = edge;
  else consumer.lastIn = edge;
  insertAfterEdge.nextIn = edge;
}
function reuseLocatedIncomingEdgeOrLink(producer, consumer, insertAfterEdge, suffixStartEdge, passStamp, edge) {
  if (edge !== null) {
    moveSuffixEdgeAfterCursor(consumer, edge, insertAfterEdge);
    edge.stamp = passStamp;
    if (false)
      observeRuntimeProjection2?.("projection.semantic.tracking.suffix.reuse");
    return edge;
  }
  if (false)
    observeRuntimeProjection2?.("projection.semantic.tracking.suffix.link-new");
  return linkEdge(producer, consumer, insertAfterEdge, passStamp);
}
function reuseIncomingEdgeFromSuffixOrLink(producer, consumer, insertAfterEdge, suffixStartEdge, passStamp = 0) {
  if (suffixStartEdge !== null && suffixStartEdge.from === producer) {
    suffixStartEdge.stamp = passStamp;
    if (false)
      observeRuntimeProjection2?.(
        "projection.semantic.tracking.suffix.head-hit"
      );
    return suffixStartEdge;
  }
  const newest = producer.lastOut;
  const edge = newest !== null && newest.to === consumer ? newest : findEdgeInLockstep(
    producer,
    consumer,
    null,
    suffixStartEdge === null ? consumer.firstIn : suffixStartEdge.nextIn
  );
  return reuseLocatedIncomingEdgeOrLink(
    producer,
    consumer,
    insertAfterEdge,
    suffixStartEdge,
    passStamp,
    edge
  );
}
var reuseIncomingEdgeFromSuffixOrCreate = reuseIncomingEdgeFromSuffixOrLink;

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/graph/sweepEdges.ts
function unlinkDetachedIncomingEdgeSequence(edge) {
  while (edge !== null) {
    const nextIn = edge.nextIn;
    const { from, prevOut, nextOut } = edge;
    if (from.tailIn === edge) from.tailIn = null;
    if (prevOut !== null) prevOut.nextOut = nextOut;
    else from.firstOut = nextOut;
    if (nextOut !== null) nextOut.prevOut = prevOut;
    else from.lastOut = prevOut;
    edge.prevOut = null;
    edge.nextOut = null;
    edge.prevIn = null;
    edge.nextIn = null;
    edge = nextIn;
  }
}
function unlinkAllSources(consumer) {
  const firstIncomingEdge = consumer.firstIn;
  consumer.firstIn = null;
  consumer.lastIn = null;
  consumer.tailIn = null;
  unlinkDetachedIncomingEdgeSequence(firstIncomingEdge);
}
function unlinkAllSubscribers(producer) {
  let outgoingEdge = producer.firstOut;
  const slotEdge = producer.tailIn;
  if (slotEdge !== null && slotEdge.from === producer && slotEdge.to !== producer) {
    producer.tailIn = null;
  }
  producer.firstOut = null;
  producer.lastOut = null;
  while (outgoingEdge !== null) {
    const nextOut = outgoingEdge.nextOut;
    const { to, prevIn, nextIn } = outgoingEdge;
    if (to.tailIn === outgoingEdge) {
      to.tailIn = prevIn;
    }
    if (prevIn !== null) prevIn.nextIn = nextIn;
    else to.firstIn = nextIn;
    if (nextIn !== null) nextIn.prevIn = prevIn;
    else to.lastIn = prevIn;
    outgoingEdge.prevOut = null;
    outgoingEdge.nextOut = null;
    outgoingEdge.prevIn = null;
    outgoingEdge.nextIn = null;
    outgoingEdge = nextOut;
  }
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/graph/disposeNode.ts
function disposeNode(node) {
  unlinkAllSources(node);
  unlinkAllSubscribers(node);
  node.compute = void 0;
  node.payload = void 0;
}
var disposeNodeEvent = disposeNode;

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/config.ts
var defaultContext = {
  scope: "runtime"
};
var DEFAULT_READ_TRACKING_STRATEGY = reuseIncomingEdgeFromSuffixOrCreate;
var readTrackingStrategy = DEFAULT_READ_TRACKING_STRATEGY;
var nodeInvalidatedHook = void 0;
var runtimeIdleHook = void 0;
var hostFlushHook = void 0;
function loadRuntimeConfiguration(configuration) {
  readTrackingStrategy = configuration.readTrackingStrategy;
  nodeInvalidatedHook = configuration.nodeInvalidatedHook;
  runtimeIdleHook = configuration.runtimeIdleHook;
  hostFlushHook = configuration.hostFlushHook;
}
var emitNodeInvalidated = true ? (node) => {
  const hook = nodeInvalidatedHook;
  if (hook === void 0) return;
  hook(node);
} : function(node) {
  if (false)
    observeRuntimeProjection3?.("projection.semantic.node.invalidated.emit");
  if (false) {
    recordDebugEvent2(defaultContext, "watcher:invalidated", { node });
  }
  const hook = nodeInvalidatedHook;
  if (hook === void 0) return;
  if (true) {
    hook(node);
    return;
  }
  const before = readRuntimePhase();
  const phaseBefore = before.phase;
  const depthBefore = before.depth;
  enterRuntimeHook("onNodeInvalidated");
  try {
    hook(node);
    devAssertRuntimeHookDidNotReenter(
      "onNodeInvalidated",
      phaseBefore,
      depthBefore
    );
  } finally {
    leaveRuntimeHook();
  }
};
function emitRuntimeIdle() {
  if (false)
    observeRuntimeProjection3?.("projection.semantic.context.settled.emit");
  if ((runtimeState & 16 /* HostWorkPending */) !== 0 /* Idle */) {
    const flush = hostFlushHook;
    try {
      if (flush !== void 0) callIdleHostHook("onHostFlush", flush);
    } finally {
      clearHostWorkPending();
    }
  }
  const hook = runtimeIdleHook;
  if (hook === void 0) return;
  callIdleHostHook("onRuntimeIdle", hook);
}
function requestHostFlush() {
  markHostWorkPending();
}
function cancelHostFlushRequest() {
  clearHostWorkPending();
}
function callIdleHostHook(name, hook) {
  if (true) {
    hook();
    return;
  }
  const before = readRuntimePhase();
  const phaseBefore = before.phase;
  const depthBefore = before.depth;
  enterRuntimeHook(name);
  try {
    hook();
    devAssertRuntimeHookDidNotReenter(name, phaseBefore, depthBefore);
  } finally {
    leaveRuntimeHook();
  }
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/batch.ts
function enterReactiveBatch() {
  enterReactiveBatchRegister();
}
function leaveReactiveBatch() {
  leaveReactiveBatchRegister();
  flushPendingRuntimeIdle();
}
function flushPendingRuntimeIdle() {
  const blockingState = 1 /* Tracking */ | 2 /* Propagating */ | 4 /* Batching */;
  if ((runtimeState & 8 /* IdlePending */) === 0 /* Idle */ || (runtimeState & blockingState) !== 0 /* Idle */)
    return;
  clearRuntimeIdlePending();
  emitRuntimeIdle();
}
function emitRuntimeIdleWithBatching() {
  if ((runtimeState & 4 /* Batching */) !== 0 /* Idle */) {
    markRuntimeIdlePending();
    if (false)
      observeRuntimeProjection4?.("projection.semantic.context.settled.defer");
    return;
  }
  if ((runtimeState & 8 /* IdlePending */) !== 0 /* Idle */) {
    clearRuntimeIdlePending();
  }
  emitRuntimeIdle();
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/context.model.ts
var RUNTIME_CONTEXT_BRAND = Symbol("RuntimeContext");
function createRuntimeContext(options = {}) {
  const context = {
    [RUNTIME_CONTEXT_BRAND]: true,
    currentConsumer: null,
    trackingStamp: 0,
    propagationScopeDepth: 0,
    batchDepth: 0,
    runtimeState: 0,
    executionFrame: null,
    readTrackingStrategy: DEFAULT_READ_TRACKING_STRATEGY,
    nodeInvalidatedHook: void 0,
    runtimeIdleHook: void 0,
    hostFlushHook: void 0
  };
  applyRuntimeContextOptions(context, options);
  return context;
}
function isRuntimeContext(value) {
  return typeof value === "object" && value !== null && value[RUNTIME_CONTEXT_BRAND] === true;
}
function applyRuntimeContextOptions(context, options) {
  if ("readTrackingStrategy" in options) {
    context.readTrackingStrategy = asFunction(options.readTrackingStrategy) ?? DEFAULT_READ_TRACKING_STRATEGY;
  }
  if ("hooks" in options) {
    const hooks = options.hooks ?? {};
    context.nodeInvalidatedHook = ownFunction(
      hooks,
      "onNodeInvalidated"
    );
    context.runtimeIdleHook = ownFunction(
      hooks,
      "onRuntimeIdle"
    );
  }
  if ("scheduler" in options) {
    const scheduler = options.scheduler ?? {};
    context.hostFlushHook = ownFunction(
      scheduler,
      "onHostFlush"
    );
  }
}
function asFunction(value) {
  return typeof value === "function" ? value : void 0;
}
function ownFunction(hooks, name) {
  const values = hooks;
  return Object.prototype.hasOwnProperty.call(hooks, name) ? asFunction(values[name]) : void 0;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/context.switch.ts
var activeRuntimeContext = createRuntimeContext();
function getActiveRuntimeContext() {
  return activeRuntimeContext;
}
function syncRuntimeContext(context, direction) {
  switch (direction) {
    case "load": {
      setCurrentConsumer(context.currentConsumer);
      keepNewestTrackingStamp(context.trackingStamp);
      setPropagationScopeDepth(context.propagationScopeDepth);
      setReactiveBatchState(context.batchDepth, context.runtimeState);
      loadRuntimeConfiguration(context);
      return;
    }
    case "save": {
      context.currentConsumer = currentConsumer;
      context.trackingStamp = trackingStamp;
      context.propagationScopeDepth = propagationScopeDepth;
      context.batchDepth = reactiveBatchDepth;
      context.runtimeState = runtimeState;
    }
  }
}
function switchRuntimeContext(next) {
  if (next === activeRuntimeContext) return;
  syncRuntimeContext(activeRuntimeContext, "save");
  if (RUNTIME_EXECUTION_FRAMES_ENABLED) {
    activeRuntimeContext.executionFrame = saveRuntimeExecutionFrame();
    loadRuntimeExecutionFrame(next.executionFrame);
    next.executionFrame = null;
  }
  activeRuntimeContext = next;
  syncRuntimeContext(next, "load");
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/context.ts
var suspendedContexts = [];
var suspendedDepth = 0;
function runWithRuntimeContext(context, fn) {
  if (false)
    observeRuntimeProjection5?.("projection.semantic.context.run");
  const previous = getActiveRuntimeContext();
  if (previous === context) return fn();
  if (false)
    observeRuntimeProjection5?.("projection.semantic.context.switch");
  switchRuntimeContext(context);
  suspendedContexts[suspendedDepth++] = previous;
  try {
    return fn();
  } finally {
    suspendedContexts[--suspendedDepth] = void 0;
    switchRuntimeContext(previous);
  }
}
function enterRuntimeContextRegion(context) {
  if (false)
    observeRuntimeProjection5?.("projection.semantic.context.run");
  const previous = getActiveRuntimeContext();
  if (previous === context) return null;
  if (false)
    observeRuntimeProjection5?.("projection.semantic.context.switch");
  switchRuntimeContext(context);
  suspendedContexts[suspendedDepth++] = previous;
  return previous;
}
function leaveRuntimeContextRegion(previous) {
  if (previous === null) return;
  suspendedContexts[--suspendedDepth] = void 0;
  switchRuntimeContext(previous);
}
function isRuntimeContextSuspended(context) {
  for (let i = suspendedDepth - 1; i >= 0; i--) {
    if (suspendedContexts[i] === context) return true;
  }
  return false;
}
function configureRuntimeContext(contextOrOptions = {}, maybeOptions = {}) {
  const explicitContext = isRuntimeContext(contextOrOptions);
  const context = explicitContext ? contextOrOptions : getActiveRuntimeContext();
  applyRuntimeContextOptions(
    context,
    explicitContext ? maybeOptions : contextOrOptions
  );
  if (context === getActiveRuntimeContext()) loadRuntimeConfiguration(context);
}
function resetRuntimeContext(context = getActiveRuntimeContext()) {
  if (isRuntimeContextSuspended(context)) {
    throw new Error(
      "Cannot reset a runtime context while its execution is suspended by a nested context."
    );
  }
  context.currentConsumer = null;
  context.trackingStamp = 0;
  context.propagationScopeDepth = 0;
  context.batchDepth = 0;
  context.runtimeState = 0;
  context.readTrackingStrategy = DEFAULT_READ_TRACKING_STRATEGY;
  context.nodeInvalidatedHook = void 0;
  context.runtimeIdleHook = void 0;
  context.hostFlushHook = void 0;
  context.executionFrame = null;
  if (context === getActiveRuntimeContext()) {
    resetRuntimeExecutionState();
    syncRuntimeContext(context, "load");
  }
}
function snapshotRuntimeContext(context = getActiveRuntimeContext()) {
  if (context === getActiveRuntimeContext())
    syncRuntimeContext(context, "save");
  const {
    currentConsumer: currentConsumer2,
    trackingStamp: trackingStamp2,
    propagationScopeDepth: propagationScopeDepth2,
    batchDepth,
    runtimeState: runtimeState2,
    readTrackingStrategy: readTrackingStrategy2,
    nodeInvalidatedHook: nodeInvalidatedHook2,
    runtimeIdleHook: runtimeIdleHook2,
    hostFlushHook: hostFlushHook2
  } = context;
  return {
    currentConsumer: currentConsumer2,
    trackingStamp: trackingStamp2,
    propagationScopeDepth: propagationScopeDepth2,
    batchDepth,
    runtimeState: runtimeState2,
    readTrackingStrategy: readTrackingStrategy2,
    nodeInvalidatedHook: nodeInvalidatedHook2,
    runtimeIdleHook: runtimeIdleHook2,
    hostFlushHook: hostFlushHook2
  };
}
function restoreRuntimeContextSnapshot(context, snapshot) {
  const active = context === getActiveRuntimeContext();
  if (active) context.trackingStamp = trackingStamp;
  context.currentConsumer = snapshot.currentConsumer;
  context.propagationScopeDepth = snapshot.propagationScopeDepth;
  context.batchDepth = snapshot.batchDepth;
  context.runtimeState = snapshot.runtimeState;
  context.readTrackingStrategy = snapshot.readTrackingStrategy;
  context.nodeInvalidatedHook = snapshot.nodeInvalidatedHook;
  context.runtimeIdleHook = snapshot.runtimeIdleHook;
  context.hostFlushHook = snapshot.hostFlushHook;
  if (active) syncRuntimeContext(context, "load");
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/context.scope.ts
function isSettledObserved() {
  return runtimeIdleHook !== void 0 || (runtimeState & 16 /* HostWorkPending */) !== 0 /* Idle */;
}
var enterPropagationScope = true ? enterPropagationScopeRegister : function() {
  if (false)
    observeRuntimeProjection6?.(
      "projection.semantic.context.propagation.scope-enter"
    );
  if (false)
    observeRuntimeProjection6?.(
      "projection.semantic.context.propagation.enter"
    );
  enterPropagationScopeRegister();
};
function leavePropagationScope() {
  if (false)
    observeRuntimeProjection6?.(
      "projection.semantic.context.propagation.scope-leave"
    );
  if (false)
    observeRuntimeProjection6?.("projection.semantic.context.propagation.leave");
  if (leavePropagationScopeRegister() !== true) {
    if (propagationScopeDepth === 0 && isSettledObserved())
      markRuntimeIdlePending();
    return;
  }
  if (!isSettledObserved()) return;
  emitRuntimeIdleWithBatching();
}
function abortPropagationScope() {
  if (false)
    observeRuntimeProjection6?.(
      "projection.semantic.context.propagation.scope-leave"
    );
  if (false)
    observeRuntimeProjection6?.("projection.semantic.context.propagation.leave");
  setPropagationScopeDepth(0);
}
function emitSettledIfIdle() {
  if (false)
    observeRuntimeProjection6?.("projection.semantic.context.settled.check");
  if (!isSettledObserved()) return;
  if ((runtimeState & (1 /* Tracking */ | 2 /* Propagating */)) !== 0 /* Idle */) {
    if (propagationScopeDepth === 0 && isSettledObserved())
      markRuntimeIdlePending();
    return;
  }
  if (false) recordDebugEvent3(defaultContext2, "context:settled");
  emitRuntimeIdleWithBatching();
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/edge.ts
var createReactiveEdge = (stamp, from, to) => ({
  stamp,
  from,
  to,
  prevOut: null,
  nextOut: null,
  prevIn: null,
  nextIn: null
});

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/node.ts
var ReactiveNode = class {
  state = 0;
  firstOut = null;
  lastOut = null;
  firstIn = null;
  lastIn = null;
  /**
   * While Computing: the tracking frontier, null or an incoming edge. While
   * not: null, the residual incoming edge of the last pass, or an outgoing
   * hint for the pair lookup (INV-H, graph/hint.ts).
   *
   * Phase-dependent tracking edge:
   * Computing -> accepted incoming frontier
   * idle      -> retained incoming edge or outgoing lookup hint
   */
  tailIn = null;
  compute;
  payload;
  constructor(payload, compute, state) {
    if (false) {
      throw new TypeError(
        `[ReactiveNode(constructor)]: payload must be primitive, function, array, or plain object, but not a ${typeof payload}`
      );
    }
    this.state = state | 0;
    this.compute = compute;
    this.payload = payload;
  }
};
var node_default = ReactiveNode;

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/dev.ts
function withOptionalConsumer(input, consumer) {
  return consumer === null || consumer === void 0 ? input : { ...input, consumer };
}
function devRecordTrackRead(context, consumer, source) {
  if (true) return;
  recordDebugEvent(context, "track:read", {
    consumer,
    source
  });
}
function devRecordNodeCreated(node, context) {
  if (true) return;
  recordDebugEvent(context, "node:create", { node });
}
function devRecordCleanupStaleSources(node, staleHead, context) {
  if (true) return;
  const removedSources = collectDebugNodeRefs(
    staleHead,
    (edge) => edge.from,
    (edge) => edge.nextIn
  );
  recordDebugEvent(context, "cleanup:stale-sources", {
    node,
    detail: {
      removedCount: removedSources.length,
      removedSources
    }
  });
}
function devAssertConsumerCanStabilize(state) {
  if (true) return;
  if ((state & Computing) === 0) return;
  throw new Error("Cycle detected while refreshing reactive graph");
}
function devRecordReadProducer(node, value, context) {
  if (true) return;
  recordDebugEvent(
    context,
    "read:producer",
    withOptionalConsumer(
      {
        node,
        detail: {
          value
        }
      },
      currentConsumer
    )
  );
}
function devRecordReadConsumer(node, mode, value, context, consumer) {
  if (true) return;
  recordDebugEvent(
    context,
    "read:consumer",
    withOptionalConsumer(
      {
        node,
        detail: {
          mode,
          value
        }
      },
      consumer
    )
  );
}
function devRecordWriteProducer(node, changed, next, previous, hasSubscribers, context) {
  if (true) return;
  recordDebugEvent(context, "write:producer", {
    node,
    detail: {
      changed,
      next,
      previous,
      hasSubscribers
    }
  });
}
function devRecordComputeStart(node, context) {
  if (true) return;
  recordDebugEvent(context, "compute:start", { node });
}
function devRecordComputeError(node, error, context) {
  if (true) return;
  recordDebugEvent(context, "compute:error", {
    node,
    detail: { error }
  });
}
function devRecordComputeFinish(node, result, context) {
  if (true) return;
  recordDebugEvent(context, "compute:finish", {
    node,
    detail: { result }
  });
}
function devRecordWatcherSkip(node, reason, context) {
  if (true) return;
  recordDebugEvent(context, "watcher:run:skip", {
    node,
    detail: { reason }
  });
}
function devRecordWatcherCleanup(node, context) {
  if (true) return;
  recordDebugEvent(context, "watcher:cleanup", { node });
}
function devRecordWatcherFinish(node, hasCleanup, result, context) {
  if (true) return;
  recordDebugEvent(context, "watcher:run:finish", {
    node,
    detail: {
      hasCleanup,
      result
    }
  });
}
function devRecordWatcherDispose(node, hadCleanup, context) {
  if (true) return;
  recordDebugEvent(context, "watcher:dispose", {
    node,
    detail: { hadCleanup }
  });
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/tracking/cleanup.ts
function cleanupUnvisitedSources(consumer) {
  if (false)
    observeRuntimeProjection7?.("projection.semantic.cleanup.invoke");
  const cursorEdge = consumer.tailIn;
  const firstUnvisitedEdge = cursorEdge === null ? consumer.firstIn : cursorEdge.nextIn;
  if (firstUnvisitedEdge === null) {
    if (false)
      observeRuntimeProjection7?.("projection.semantic.cleanup.skip");
    return;
  }
  if (cursorEdge === null) {
    consumer.firstIn = null;
    consumer.lastIn = null;
  } else {
    cursorEdge.nextIn = null;
    consumer.lastIn = cursorEdge;
  }
  devRecordCleanupStaleSources(consumer, firstUnvisitedEdge, defaultContext);
  if (false) {
    for (let unvisitedEdge = firstUnvisitedEdge; unvisitedEdge !== null; unvisitedEdge = unvisitedEdge.nextIn) {
      observeRuntimeProjection7?.("projection.semantic.cleanup.edge.drop");
    }
  }
  unlinkDetachedIncomingEdgeSequence(firstUnvisitedEdge);
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/shape/graph/cursorMoves.ts
function moveTrackedIncomingEdgeToFrontUnchecked(consumer, movedEdge, passStamp) {
  const previousMovedEdge = movedEdge.prevIn;
  const afterMovedEdge = movedEdge.nextIn;
  previousMovedEdge.nextIn = afterMovedEdge;
  if (afterMovedEdge !== null) {
    afterMovedEdge.prevIn = previousMovedEdge;
  } else {
    consumer.lastIn = previousMovedEdge;
  }
  const firstIncomingEdge = consumer.firstIn;
  movedEdge.prevIn = null;
  movedEdge.nextIn = firstIncomingEdge;
  firstIncomingEdge.prevIn = movedEdge;
  consumer.firstIn = movedEdge;
  movedEdge.stamp = passStamp;
  consumer.tailIn = movedEdge;
}
function moveTrackedIncomingEdgeAfterCursorUnchecked(consumer, cursorEdge, movedEdge) {
  const expectedNextEdge = cursorEdge.nextIn;
  const previousMovedEdge = movedEdge.prevIn;
  const afterMovedEdge = movedEdge.nextIn;
  previousMovedEdge.nextIn = afterMovedEdge;
  if (afterMovedEdge !== null) {
    afterMovedEdge.prevIn = previousMovedEdge;
  } else {
    consumer.lastIn = previousMovedEdge;
  }
  movedEdge.prevIn = cursorEdge;
  movedEdge.nextIn = expectedNextEdge;
  cursorEdge.nextIn = movedEdge;
  expectedNextEdge.prevIn = movedEdge;
  movedEdge.stamp = cursorEdge.stamp;
  consumer.tailIn = movedEdge;
  return true;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/tracking/locate.ts
function locateEdge(producer, consumer, back, ahead, reorder) {
  const newest = producer.lastOut;
  if (newest !== null) {
    if (newest.to === consumer) return newest;
    if (reorder === false && newest === producer.firstOut) return null;
  } else if (reorder === false) {
    return null;
  }
  return findEdgeInLockstep(producer, consumer, back, ahead);
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/tracking/prefix.ts
function isEdgeInTrackedPrefix(consumer, cursorEdge, edge) {
  if (cursorEdge === consumer.lastIn) return true;
  const passStamp = cursorEdge.stamp;
  if (passStamp !== 0) return edge.stamp === passStamp;
  for (let prefixEdge = cursorEdge; prefixEdge !== null; prefixEdge = prefixEdge.prevIn) {
    if (prefixEdge === edge) return true;
  }
  return false;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/tracking/resolve.ts
function resolveTrackedReadMiss(producer, consumer, cursorEdge) {
  let suffixStartEdge;
  let ahead;
  if (cursorEdge === null) {
    suffixStartEdge = consumer.firstIn;
    if (true) {
      const lastIncomingEdge = consumer.lastIn;
      if (lastIncomingEdge.from === producer) {
        if (false)
          observeRuntimeProjection8?.(
            "projection.semantic.tracking.initial.last-edge-shortcut"
          );
        moveTrackedIncomingEdgeToFrontUnchecked(
          consumer,
          lastIncomingEdge,
          trackingStamp
        );
        devRecordTrackRead(defaultContext, consumer, producer);
        return;
      }
    }
    ahead = suffixStartEdge.nextIn;
  } else {
    suffixStartEdge = cursorEdge.nextIn;
    if (suffixStartEdge === null) {
      ahead = null;
    } else {
      const lookahead1Edge = suffixStartEdge.nextIn;
      let movedEdge = null;
      if (lookahead1Edge !== null) {
        if (lookahead1Edge.from === producer) {
          if (false)
            observeRuntimeProjection8?.(
              "projection.semantic.tracking.reorder.one-hop"
            );
          movedEdge = lookahead1Edge;
        } else if (true) {
          const lookahead2Edge = lookahead1Edge.nextIn;
          if (lookahead2Edge !== null && lookahead2Edge.from === producer) {
            if (false)
              observeRuntimeProjection8?.(
                "projection.semantic.tracking.reorder.two-hop"
              );
            movedEdge = lookahead2Edge;
          }
        }
      }
      if (movedEdge === null) {
        const lastIncomingEdge = consumer.lastIn;
        if (lastIncomingEdge.from === producer) {
          if (false)
            observeRuntimeProjection8?.(
              "projection.semantic.tracking.last-edge.shortcut"
            );
          movedEdge = lastIncomingEdge;
        }
      }
      if (movedEdge !== null) {
        moveTrackedIncomingEdgeAfterCursorUnchecked(
          consumer,
          cursorEdge,
          movedEdge
        );
        devRecordTrackRead(defaultContext, consumer, producer);
        return;
      }
      ahead = lookahead1Edge;
    }
  }
  const locatedEdge = locateEdge(
    producer,
    consumer,
    cursorEdge === null ? null : cursorEdge.prevIn,
    ahead,
    cursorEdge !== null && suffixStartEdge !== null
  );
  if (cursorEdge !== null) {
    if (locatedEdge !== null && (suffixStartEdge === null || isEdgeInTrackedPrefix(consumer, cursorEdge, locatedEdge) === true)) {
      if (false)
        observeRuntimeProjection8?.(
          "projection.semantic.tracking.prefix.duplicate"
        );
      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }
    if (suffixStartEdge === null) {
      appendTrackedEdgeAfterCursorUnchecked(
        producer,
        consumer,
        cursorEdge,
        cursorEdge.stamp
      );
      if (false)
        observeRuntimeProjection8?.(
          "projection.semantic.tracking.cursor.append"
        );
      devRecordTrackRead(defaultContext, consumer, producer);
      return;
    }
  }
  const passStamp = cursorEdge === null ? trackingStamp : cursorEdge.stamp;
  devRecordTrackRead(defaultContext, consumer, producer);
  if (false)
    observeRuntimeProjection8?.("projection.semantic.tracking.slow-path");
  if (readTrackingStrategy !== DEFAULT_READ_TRACKING_STRATEGY) {
    consumer.tailIn = readTrackingStrategy(
      producer,
      consumer,
      cursorEdge,
      suffixStartEdge,
      passStamp
    );
    return;
  }
  if (locatedEdge === null) {
    if (false)
      observeRuntimeProjection8?.(
        "projection.semantic.tracking.suffix.link-new"
      );
    consumer.tailIn = linkEdge(producer, consumer, cursorEdge, passStamp);
    return;
  }
  if (false)
    observeRuntimeProjection8?.("projection.semantic.tracking.edge.move");
  if (cursorEdge === null) {
    moveTrackedIncomingEdgeToFrontUnchecked(consumer, locatedEdge, passStamp);
  } else {
    moveTrackedIncomingEdgeAfterCursorUnchecked(
      consumer,
      cursorEdge,
      locatedEdge
    );
  }
  if (false)
    observeRuntimeProjection8?.("projection.semantic.tracking.suffix.reuse");
}
function resolveTrackedRead(producer, consumer) {
  {
    if (false)
      observeRuntimeProjection8?.("projection.semantic.tracking.resolve");
  }
  const cursorEdge = consumer.tailIn;
  if (cursorEdge !== null) {
    const expectedNextEdge = cursorEdge.nextIn;
    if (expectedNextEdge !== null && expectedNextEdge.from === producer) {
      expectedNextEdge.stamp = cursorEdge.stamp;
      consumer.tailIn = expectedNextEdge;
      {
        if (false)
          observeRuntimeProjection8?.("projection.semantic.tracking.next.hit");
        devRecordTrackRead(defaultContext, consumer, producer);
      }
      return;
    }
    if (cursorEdge.from === producer) {
      {
        if (false)
          observeRuntimeProjection8?.("projection.semantic.tracking.cursor.hit");
        devRecordTrackRead(defaultContext, consumer, producer);
      }
      return;
    }
    resolveTrackedReadMiss(producer, consumer, cursorEdge);
    return;
  }
  const firstIncomingEdge = consumer.firstIn;
  if (firstIncomingEdge === null) {
    linkFirstTrackedEdgeUnchecked(producer, consumer, trackingStamp);
    {
      if (false)
        observeRuntimeProjection8?.(
          "projection.semantic.tracking.initial.create"
        );
      devRecordTrackRead(defaultContext, consumer, producer);
    }
    return;
  }
  if (firstIncomingEdge.from === producer) {
    firstIncomingEdge.stamp = trackingStamp;
    consumer.tailIn = firstIncomingEdge;
    {
      if (false)
        observeRuntimeProjection8?.(
          "projection.semantic.tracking.initial.first-hit"
        );
      devRecordTrackRead(defaultContext, consumer, producer);
    }
    return;
  }
  resolveTrackedReadMiss(producer, consumer, null);
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/tracking/read.ts
function trackRead(source, consumer = currentConsumer) {
  if (consumer === null) return;
  resolveTrackedRead(source, consumer);
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/propagation/push_iterator_once.ts
function pushIteratorOnceCore(edge, skip) {
  if (false)
    observeRuntimeProjection9?.("projection.semantic.push-once.invoke");
  for (let current = edge; current !== null; current = current.nextOut) {
    if (current === skip) {
      if (false)
        observeRuntimeProjection9?.(
          "projection.semantic.push-once.edge.explicit-skip"
        );
      continue;
    }
    if (false)
      observeRuntimeProjection9?.("projection.semantic.push-once.edge.visit");
    const sub = current.to;
    const state = sub.state;
    if ((state & Changed) === 0) {
      sub.state = (state & Watcher) !== 0 ? state | Changed : state & ~Unknown | Changed;
      if (false)
        observeRuntimeProjection9?.(
          "projection.semantic.push-once.subscriber.changed.mark"
        );
      if (false)
        observeRuntimePropagate?.({
          edge: current,
          nextState: sub.state,
          immediate: true,
          context: defaultContext3
        });
      if ((state & Watcher) !== 0 && nodeInvalidatedHook !== void 0) {
        if ((state & (Scheduled | Computing)) !== 0) {
          if (false)
            observeRuntimeProjection9?.(
              "projection.semantic.push-once.watcher.scheduled-delivery-skip"
            );
          continue;
        }
        if (false) emitNodeInvalidated2(sub);
        if (true) nodeInvalidatedHook(sub);
      }
    } else {
      if (false)
        observeRuntimeProjection9?.(
          "projection.semantic.push-once.subscriber.changed.skip"
        );
    }
  }
}
var push_iterator_once = false ? function pushIteratorOnceDev(edge, skip = null) {
  enterRuntimePhase2(RuntimePhase2.Propagating);
  try {
    pushIteratorOnceCore(edge, skip);
  } finally {
    leaveRuntimePhase2();
  }
} : pushIteratorOnceCore;
var push_iterator_once_skipping = push_iterator_once;

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/stackStats.ts
var STACK_TRIM_MIN_CAPACITY = 256;
var shouldRecomputeStackPeak = 0;
var resumeEdgeStackPeak = 0;
function noteShouldRecomputeStackUsage(stackTop) {
  if (true) return;
  if (stackTop <= shouldRecomputeStackPeak) return;
  shouldRecomputeStackPeak = stackTop;
}
function noteResumeEdgeStackUsage(stackTop) {
  if (true) return;
  if (stackTop <= resumeEdgeStackPeak) return;
  resumeEdgeStackPeak = stackTop;
}
function resetRuntimeWalkerStackStats() {
  if (true) return;
  shouldRecomputeStackPeak = 0;
  resumeEdgeStackPeak = 0;
}
function trimWalkerStackIfSparse(stack2, high2) {
  const len = stack2.length;
  if (len < STACK_TRIM_MIN_CAPACITY) return;
  if (high2 > len >> 2) return;
  stack2.length = high2;
}
function trimWalkerStackToFloorIfSparse(stack2) {
  const len = stack2.length;
  if (len <= STACK_TRIM_MIN_CAPACITY) return;
  stack2.length = STACK_TRIM_MIN_CAPACITY;
}
function readRuntimeWalkerStackStats(shouldRecomputeStackHigh, shouldRecomputeStackCapacity, resumeStackHigh, resumeEdgeStackCapacity) {
  if (true) {
    return {
      shouldRecompute: {
        current: 0,
        peak: 0,
        capacity: 0
      },
      propagate: {
        current: 0,
        peak: 0,
        capacity: 0
      }
    };
  }
  return {
    shouldRecompute: {
      current: shouldRecomputeStackHigh,
      peak: shouldRecomputeStackPeak,
      capacity: shouldRecomputeStackCapacity
    },
    propagate: {
      current: resumeStackHigh,
      peak: resumeEdgeStackPeak,
      capacity: resumeEdgeStackCapacity
    }
  };
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/propagation/push_iterator.ts
var propagateStack = new Array(512).fill(null);
var MAX_RETAINED_PROPAGATE_STACK = 512;
var propagateDepthStack = false ? new Array(512).fill(0) : void 0;
var propagateStackHigh = 0;
function dispatchWatcherInvalidation(sub, base, top) {
  propagateStackHigh = top;
  try {
    if (false) emitNodeInvalidated3(sub);
    else nodeInvalidatedHook(sub);
  } catch (error) {
    while (top !== base) propagateStack[--top] = null;
    propagateStackHigh = base;
    throw error;
  }
}
function markComputingSubscriber(edge, sub, state) {
  if (false)
    observeRuntimeProjection10?.(
      "projection.semantic.push.subscriber.computing.check"
    );
  const tail = sub.tailIn;
  if (tail === null) return 0;
  if (edge !== tail && isEdgeInTrackedPrefix(sub, tail, edge) !== true) {
    return 0;
  }
  return sub.state = state | Visited | Unknown;
}
function pushIteratorCore(firstOut) {
  if (false)
    observeRuntimeProjection10?.("projection.semantic.push.invoke");
  const stack2 = propagateStack;
  const base = propagateStackHigh | 0;
  let top = base;
  for (let edge = firstOut; edge !== null; edge = edge.nextOut) {
    if (false)
      observeRuntimeProjection10?.("projection.semantic.push.edge.direct.visit");
    const sub = edge.to;
    const state = sub.state;
    let next = 0;
    if ((state & (Both | Computing)) === 0) {
      next = state & ~Visited | Changed;
      sub.state = next;
    } else if ((state & Unknown) !== 0 && (state & Watcher) === 0) {
      next = state & ~(Unknown | Visited) | Changed;
      sub.state = next;
    } else if ((state & Computing) !== 0) {
      next = markComputingSubscriber(edge, sub, state);
    } else if ((state & Unknown) !== 0) {
      next = state & ~Visited | Changed;
      sub.state = next;
    }
    if (next === 0) {
      if (false) {
        if (false)
          observeRuntimeProjection10?.(
            "projection.semantic.push.subscriber.dirty.skip"
          );
        profilePushNode("direct.skip", sub, 1, top - base);
      }
      continue;
    }
    if (false) {
      if (false)
        observeRuntimeProjection10?.(
          (next & Changed) !== 0 ? "projection.semantic.push.subscriber.changed.mark" : "projection.semantic.push.subscriber.invalid.mark"
        );
      profilePushNode(
        (next & Changed) !== 0 ? "direct.changed" : "direct.unknown",
        sub,
        1,
        top - base
      );
    }
    if (false)
      observeRuntimePropagate2?.({
        edge,
        nextState: next,
        immediate: true,
        context: defaultContext4
      });
    if ((next & Watcher) !== 0) {
      if (false) {
        if (false)
          observeRuntimeProjection10?.(
            "projection.semantic.push.watcher.invalidate"
          );
        profilePushNode("direct.watcher", sub, 1, top - base);
      }
      if ((state & (Unknown | Computing)) === Unknown) continue;
      if (nodeInvalidatedHook !== void 0)
        dispatchWatcherInvalidation(sub, base, top);
      continue;
    }
    const child = sub.firstOut;
    if (child !== null) {
      if (false)
        observeRuntimeProjection10?.("projection.semantic.push.frontier.enqueue");
      if (false) propagateDepthStack[top] = 2;
      stack2[top++] = child;
      if (false) noteResumeEdgeStackUsage2(top);
    }
  }
  while (top !== base) {
    let edge = stack2[--top];
    stack2[top] = null;
    let depth = false ? propagateDepthStack[top] : 0;
    while (edge !== null) {
      if (false)
        observeRuntimeProjection10?.(
          "projection.semantic.push.edge.transitive.visit"
        );
      const sub = edge.to;
      const state = sub.state;
      let next = 0;
      if ((state & (Both | Computing)) === 0) {
        next = state & ~Visited | Unknown;
        sub.state = next;
      } else if ((state & Computing) !== 0) {
        next = markComputingSubscriber(edge, sub, state);
        if (next !== 0 && (state & Watcher) !== 0)
          next = sub.state = state | Unknown | Revalidate;
      } else if ((state & (Watcher | Unknown)) === Watcher) {
        next = state & ~Visited | Unknown;
        sub.state = next;
      }
      const sibling = edge.nextOut;
      if (next !== 0) {
        if (false) {
          if (false)
            observeRuntimeProjection10?.(
              "projection.semantic.push.subscriber.invalid.mark"
            );
          profilePushNode("transitive.unknown", sub, depth, top - base);
        }
        if (false)
          observeRuntimePropagate2?.({
            edge,
            nextState: next,
            immediate: false,
            context: defaultContext4
          });
        if ((state & (Watcher | Both)) === Watcher && nodeInvalidatedHook !== void 0) {
          if (false) {
            if (false)
              observeRuntimeProjection10?.(
                "projection.semantic.push.watcher.invalidate"
              );
            profilePushNode("transitive.watcher", sub, depth, top - base);
          }
          dispatchWatcherInvalidation(sub, base, top);
        } else {
          const child = sub.firstOut;
          if (child !== null) {
            if (sibling !== null) {
              if (false)
                observeRuntimeProjection10?.(
                  "projection.semantic.push.frontier.enqueue"
                );
              if (false) propagateDepthStack[top] = depth;
              stack2[top++] = sibling;
              if (false) noteResumeEdgeStackUsage2(top);
            }
            edge = child;
            if (false) depth += 1;
            continue;
          }
        }
      } else {
        if (false) {
          if (false)
            observeRuntimeProjection10?.(
              "projection.semantic.push.subscriber.dirty.skip"
            );
          profilePushNode("transitive.skip", sub, depth, top - base);
        }
      }
      edge = sibling;
    }
  }
  propagateStackHigh = base;
  if (base === 0 && stack2.length > MAX_RETAINED_PROPAGATE_STACK) {
    if (false) {
      if (false)
        observeRuntimeProjection10?.("projection.semantic.push.stack.trim");
      if (false)
        observeRuntimeProjectionAmount?.(
          "projection.semantic.push.stack.trim.excess",
          stack2.length - MAX_RETAINED_PROPAGATE_STACK
        );
    }
    stack2.length = MAX_RETAINED_PROPAGATE_STACK;
  }
}
var push_iterator = false ? function pushIteratorDev(firstOut) {
  enterRuntimePhase3(RuntimePhase3.Propagating);
  try {
    pushIteratorCore(firstOut);
  } finally {
    leaveRuntimePhase3();
  }
} : pushIteratorCore;
function readPropagateStackStats() {
  return readRuntimeWalkerStackStats(
    0,
    0,
    propagateStackHigh,
    propagateStack.length
  );
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/stabilization/advance.ts
var compare = Object.is;
function advanceCore(node, skipOutEdge) {
  if (false)
    observeRuntimeProjection11?.("projection.semantic.advance.invoke");
  if (false) devAssertExecutableNode(node);
  const compute = node.compute;
  node.tailIn = null;
  const computingState = node.state & ~Visited | Computing;
  node.state = computingState;
  const prevActive = enterConsumerTracking(node);
  if (false) devRecordComputeStart2(node, defaultContext5);
  let next;
  try {
    if (false)
      observeRuntimeProjection11?.("projection.semantic.advance.compute.run");
    next = compute();
  } catch (error) {
    restoreConsumerTracking(prevActive);
    node.state = computingState & ~(Computing | Unknown) | Changed;
    if (false) devRecordComputeError2(node, error, defaultContext5);
    throw error;
  }
  restoreConsumerTracking(prevActive);
  if (false)
    observeRuntimeProjection11?.("projection.semantic.advance.cleanup.check");
  if (node.tailIn !== node.lastIn) {
    node.state = computingState & ~Computing;
    if (false)
      observeRuntimeProjection11?.("projection.semantic.advance.cleanup.run");
    cleanupUnvisitedSources(node);
  }
  if (false) devRecordComputeFinish2(node, next, defaultContext5);
  node.state = computingState & ~(Computing | Both);
  const prev = node.payload;
  if (compare(prev, next) === true) {
    if (false)
      observeRuntimeProjection11?.("projection.semantic.advance.value.unchanged");
    if (false) devRecordRecompute(node, false, next, prev, defaultContext5);
    return false;
  }
  node.payload = next;
  if (false)
    observeRuntimeProjection11?.("projection.semantic.advance.value.changed");
  if (false) devRecordRecompute(node, true, next, prev, defaultContext5);
  const firstOut = node.firstOut;
  if (firstOut !== null) {
    if (false)
      observeRuntimeProjection11?.(
        "projection.semantic.advance.propagate.invoke"
      );
    if (false) devAssertRefreshEdge(node, firstOut);
    if (firstOut !== skipOutEdge || firstOut.nextOut !== null) {
      if (false)
        observeRuntimeProjection11?.(
          "projection.semantic.advance.propagate.skip-edge"
        );
      push_iterator_once(firstOut, skipOutEdge);
    } else if (false) {
      observeRuntimeProjection11?.(
        "projection.semantic.advance.propagate.owned-edge-only-skip"
      );
    }
  }
  return true;
}
var advance = false ? function advanceDev(node, skipOutEdge) {
  enterRuntimePhase4(RuntimePhase4.Recomputing);
  try {
    return advanceCore(node, skipOutEdge);
  } finally {
    leaveRuntimePhase4();
  }
} : advanceCore;

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/stabilization/pull_iterator.ts
var stack = [];
var high = 0;
function pull_iterator(parentEdge, node, edge) {
  const base = high | 0;
  let top = base;
  let changed = false;
  stack[top++] = parentEdge;
  {
    if (false) {
      noteShouldRecomputeStackUsage2(top);
    }
  }
  try {
    traverse: while (true) {
      if ((node.state & Changed) !== 0) {
        {
          if (false) {
            profilePullNode("node.changed", node, top - base, top - base);
          }
        }
        changed = true;
      } else {
        descend: while (true) {
          {
            if (false) {
              observeRuntimeProjection12?.("projection.semantic.pull.edge.visit");
            }
          }
          const dep = edge.from;
          const state = dep.state;
          {
            if (false) {
              throw new Error("Cycle detected while refreshing reactive graph");
            }
          }
          const dirty = state & Both;
          if (dirty !== 0) {
            const depChanged = (dirty & Changed) !== 0;
            if (!depChanged) {
              {
                if (false) {
                  observeRuntimeProjection12?.(
                    "projection.semantic.pull.dependency.invalid"
                  );
                }
              }
              const firstIn = dep.firstIn;
              if (firstIn !== null) {
                {
                  if (false) {
                    observeRuntimeProjection12?.(
                      "projection.semantic.pull.descend"
                    );
                    profilePullNode(
                      "dep.unknown.descend",
                      dep,
                      top - base + 1,
                      top - base
                    );
                  }
                }
                stack[top++] = edge;
                {
                  if (false) {
                    noteShouldRecomputeStackUsage2(top);
                  }
                }
                node = dep;
                edge = firstIn;
                continue descend;
              }
            }
            {
              if (false) {
                if (depChanged) {
                  observeRuntimeProjection12?.(
                    "projection.semantic.pull.dependency.changed"
                  );
                }
                observeRuntimeProjection12?.(
                  "projection.semantic.pull.advance.invoke"
                );
                profilePullNode(
                  depChanged ? "dep.changed.advance" : "dep.unknown.leaf.advance",
                  dep,
                  top - base + 1,
                  top - base
                );
              }
            }
            high = top;
            {
              if (false) {
                devAssertRefreshEdge2(dep, edge);
              }
            }
            if (advance(dep, edge) === true) {
              changed = true;
              break descend;
            }
            if ((node.state & Changed) !== 0) {
              changed = true;
              break descend;
            }
          } else if (false) {
            {
              observeRuntimeProjection12?.(
                "projection.semantic.pull.dependency.clean"
              );
              profilePullNode("dep.clean", dep, top - base + 1, top - base);
            }
          }
          const sibling = edge.nextIn;
          if (sibling === null) {
            changed = false;
            break descend;
          }
          {
            if (false) {
              observeRuntimeProjection12?.(
                "projection.semantic.pull.sibling.stable-scan"
              );
              profilePullNode(
                "sibling.stable",
                sibling.from,
                top - base + 1,
                top - base
              );
            }
          }
          edge = sibling;
        }
      }
      unwind: while (top !== base) {
        const parentEdge2 = stack[--top];
        stack[top] = null;
        high = top;
        if (changed) {
          {
            if (false) {
              observeRuntimeProjection12?.(
                "projection.semantic.pull.changed.bubble"
              );
              observeRuntimeProjection12?.(
                "projection.semantic.pull.advance.invoke"
              );
              profilePullNode(
                "bubble.changed.advance",
                node,
                top - base + 1,
                top - base
              );
            }
          }
          changed = advance(node, parentEdge2);
        } else {
          node.state &= ~Unknown;
        }
        node = parentEdge2.to;
        if (!changed && top !== base) {
          const sibling = parentEdge2.nextIn;
          if (sibling !== null) {
            {
              if (false) {
                observeRuntimeProjection12?.(
                  "projection.semantic.pull.sibling.stable-scan"
                );
                profilePullNode(
                  "sibling.after-stable-pop",
                  sibling.from,
                  top - base + 1,
                  top - base
                );
              }
            }
            edge = sibling;
            continue traverse;
          }
        }
      }
      return changed;
    }
  } finally {
    while (top !== base) {
      stack[--top] = null;
    }
    high = base;
    if (base === 0 && stack.length > STACK_TRIM_MIN_CAPACITY) {
      {
        if (false) {
          if (false)
            observeRuntimeProjection12?.("projection.semantic.pull.stack.trim");
          if (false)
            observeRuntimeProjectionAmount2?.(
              "projection.semantic.pull.stack.trim.excess",
              stack.length - STACK_TRIM_MIN_CAPACITY
            );
        }
      }
      trimWalkerStackToFloorIfSparse(stack);
    }
  }
}
function readShouldRecomputeStackStats() {
  return readRuntimeWalkerStackStats(high, stack.length, 0, 0);
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/stabilization/pull_dependency.ts
function pullDependencyDirty(edge, dependency, state) {
  const changed = state & Changed;
  if (changed === 0) {
    const firstIn = dependency.firstIn;
    if (firstIn !== null) {
      if (false) {
        observeRuntimeProjection13?.(
          "projection.semantic.pull.dependency.invalid"
        );
        observeRuntimeProjection13?.("projection.semantic.pull.descend");
        profilePullNode2("dep.unknown.descend", dependency, 1, 0);
      }
      return pull_iterator(edge, dependency, firstIn);
    }
  }
  if (false) {
    observeRuntimeProjection13?.(
      changed !== 0 ? "projection.semantic.pull.dependency.changed" : "projection.semantic.pull.dependency.invalid"
    );
    observeRuntimeProjection13?.("projection.semantic.pull.advance.invoke");
    profilePullNode2(
      changed !== 0 ? "dep.changed.advance" : "dep.unknown.leaf.advance",
      dependency,
      1,
      0
    );
  }
  if (false) devAssertRefreshEdge3(dependency, edge);
  return advance(dependency, edge) === true;
}
function pullDependencyCore(edge) {
  if (false) {
    observeRuntimeProjection13?.("projection.semantic.pull.edge.visit");
  }
  const dependency = edge.from;
  const state = dependency.state;
  if (false) {
    throw new Error("Cycle detected while refreshing reactive graph");
  }
  if ((state & Both) === 0) {
    if (false) {
      observeRuntimeProjection13?.("projection.semantic.pull.dependency.clean");
      profilePullNode2("dep.clean", dependency, 1, 0);
    }
    return false;
  }
  return pullDependencyDirty(edge, dependency, state) === true;
}
function shouldRecomputeCore(node, edge) {
  if (false) {
    observeRuntimeProjection13?.("projection.semantic.pull.invoke");
  }
  if ((node.state & Changed) !== 0) return true;
  while (true) {
    if (false) {
      observeRuntimeProjection13?.("projection.semantic.pull.edge.visit");
    }
    const dependency = edge.from;
    const state = dependency.state;
    if (false) {
      throw new Error("Cycle detected while refreshing reactive graph");
    }
    if ((state & Both) === 0) {
      if (false) {
        observeRuntimeProjection13?.("projection.semantic.pull.dependency.clean");
        profilePullNode2("dep.clean", dependency, 1, 0);
      }
    } else {
      if (pullDependencyDirty(edge, dependency, state) === true) return true;
      if ((node.state & Changed) !== 0) return true;
    }
    const sibling = edge.nextIn;
    if (sibling === null) {
      node.state &= ~Unknown;
      return false;
    }
    if (false) {
      observeRuntimeProjection13?.(
        "projection.semantic.pull.sibling.stable-scan"
      );
      profilePullNode2("sibling.stable", sibling.from, 1, 0);
    }
    edge = sibling;
  }
}
var should_recompute = false ? function shouldRecomputeDev(node, edge) {
  enterRuntimePhase5(RuntimePhase5.Pulling);
  try {
    return shouldRecomputeCore(node, edge);
  } finally {
    leaveRuntimePhase5();
  }
} : shouldRecomputeCore;
var pull_dependency = false ? function pullDependencyDev(edge) {
  enterRuntimePhase5(RuntimePhase5.Pulling);
  try {
    return pullDependencyCore(edge);
  } finally {
    leaveRuntimePhase5();
  }
} : pullDependencyCore;

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/stages/stabilization/pull_frontier.ts
function pull_frontier(root, firstEdge) {
  const initialState = root.state;
  const previousTail = root.tailIn;
  root.tailIn = root.lastIn;
  root.state = initialState & ~(Visited | Revalidate) | Computing | ((initialState & Visited) !== 0 ? Changed : 0);
  let changed = false;
  try {
    for (let edge = firstEdge; edge !== null; edge = edge.nextIn) {
      if (false)
        observeRuntimeProjection14?.(
          "projection.semantic.watcher.frontier.edge.visit"
        );
      const dependency = edge.from;
      const state = dependency.state;
      {
        if (false) {
          throw new Error("Cycle detected while refreshing reactive graph");
        }
      }
      if ((state & Changed) !== 0) {
        if (false)
          observeRuntimeProjection14?.(
            "projection.semantic.watcher.frontier.dependency.changed"
          );
        if (advance(dependency, edge) === true) changed = true;
        continue;
      }
      if ((state & Unknown) === 0) {
        if (false)
          observeRuntimeProjection14?.(
            "projection.semantic.watcher.frontier.dependency.clean"
          );
        continue;
      }
      if (false)
        observeRuntimeProjection14?.(
          "projection.semantic.watcher.frontier.dependency.invalid"
        );
      const dependencyEdge = dependency.firstIn;
      if (dependencyEdge === null || should_recompute(dependency, dependencyEdge) === true) {
        if (advance(dependency, edge) === true) {
          changed = true;
        }
      }
    }
    return changed;
  } catch (error) {
    if (changed) root.state |= Changed;
    throw error;
  } finally {
    root.state &= ~Computing;
    if (root.compute !== void 0) {
      root.tailIn = previousTail;
    }
  }
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/engine/watcher.execution.ts
var executeKnownNodeComputation = true ? executeComputation : function(node, compute) {
  enterRuntimePhase6(RuntimePhase6.Recomputing);
  try {
    return executeComputation(node, compute);
  } finally {
    leaveRuntimePhase6();
  }
};
function executeComputation(node, compute) {
  node.tailIn = null;
  node.state = node.state & ~Visited | Computing;
  const prevActive = enterConsumerTracking(node);
  if (false)
    observeRuntimeProjection15?.("projection.semantic.compute.context.enter");
  devRecordComputeStart(node, defaultContext);
  let result;
  try {
    result = compute();
  } catch (error) {
    restoreConsumerTracking(prevActive);
    if (false)
      observeRuntimeProjection15?.("projection.semantic.compute.context.restore");
    node.state &= ~Computing;
    devRecordComputeError(node, error, defaultContext);
    throw error;
  }
  restoreConsumerTracking(prevActive);
  if (false)
    observeRuntimeProjection15?.("projection.semantic.compute.context.restore");
  node.state &= ~Computing;
  if (node.tailIn !== node.lastIn) {
    cleanupUnvisitedSources(node);
  }
  devRecordComputeFinish(node, result, defaultContext);
  return result;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/kernel/engine/watcher.ts
var WATCHER_TRANSIENT_STATE = Both | Visited | Computing | Scheduled | Revalidate;
function recoverWatcherAfterError(node) {
  node.state &= ~WATCHER_TRANSIENT_STATE;
}
function recoverWatcherAfterValidationError(node) {
  const retryState = node.state & (Changed | Visited | Scheduled) | Unknown;
  node.state = node.state & ~WATCHER_TRANSIENT_STATE | retryState;
}
function recoverWatcherAfterComputationError(node) {
  for (let edge = node.firstIn; edge !== null; edge = edge.nextIn) {
    if ((edge.from.state & Both) !== 0) {
      recoverWatcherAfterValidationError(node);
      return;
    }
  }
  recoverWatcherAfterError(node);
}
function claimWatcherSchedule(node) {
  if (false)
    observeRuntimeProjection16?.("projection.semantic.watcher.schedule.attempt");
  const state = node.state;
  if ((state & Scheduled) !== 0) {
    if (false)
      observeRuntimeProjection16?.(
        "projection.semantic.watcher.schedule.dedup-skip"
      );
    return false;
  }
  node.state = state | Scheduled;
  if (false)
    observeRuntimeProjection16?.("projection.semantic.watcher.schedule.success");
  return true;
}
function releaseWatcherSchedule(node) {
  if (false)
    observeRuntimeProjection16?.("projection.semantic.watcher.schedule.release");
  node.state &= ~Scheduled;
}
function runCleanup(cleanup) {
  if (false)
    observeRuntimeProjection16?.("projection.semantic.watcher.cleanup");
  const prevActive = currentConsumer;
  if (prevActive === null) {
    cleanup();
    return;
  }
  setCurrentConsumer(null);
  try {
    cleanup();
  } finally {
    setCurrentConsumer(prevActive);
  }
}
function deliverRetainedValidation(node) {
  if ((node.state & (Revalidate | Visited | Scheduled)) === Revalidate)
    emitNodeInvalidated(node);
}
function retainAfterExecution(node) {
  const undelivered = (node.state & (Revalidate | Visited | Scheduled)) === Revalidate;
  node.state = node.state & ~(Changed | Revalidate) | Unknown;
  if (undelivered) emitNodeInvalidated(node);
}
function runWatcher(node) {
  runWatcherWithoutSettledCheckpoint(node);
  if ((runtimeState & 8 /* IdlePending */) !== 0 /* Idle */) {
    flushPendingRuntimeIdle();
  }
}
var runWatcherWithoutSettledCheckpoint = true ? runWatcherCore : function(node) {
  devAssertNoRuntimeHookWatcherExecution2();
  enterRuntimePhase7(RuntimePhase7.WatcherExecution);
  try {
    runWatcherCore(node);
  } finally {
    leaveRuntimePhase7();
  }
};
function runWatcherCore(node) {
  if (false)
    observeRuntimeProjection16?.("projection.semantic.watcher.run");
  const state = node.state;
  if ((state & Both) === 0) {
    if (false)
      observeRuntimeProjection16?.("projection.semantic.watcher.clean.skip");
    devRecordWatcherSkip(node, "clean", defaultContext);
    return;
  }
  if ((state & Unknown) !== 0) {
    const mustExecute = (state & (Changed | Visited)) !== 0;
    let changed;
    try {
      if (false)
        observeRuntimeProjection16?.(
          "projection.semantic.watcher.frontier.invoke"
        );
      changed = pull_frontier(node, node.firstIn);
    } catch (error) {
      recoverWatcherAfterValidationError(node);
      throw error;
    }
    const invalidatedDuringValidation = (node.state & (Visited | Revalidate)) !== 0;
    if (!invalidatedDuringValidation) node.state &= ~Unknown;
    if (mustExecute || changed === true) node.state |= Changed;
    if ((node.state & Changed) === 0) {
      if (false)
        observeRuntimeProjection16?.("projection.semantic.watcher.stable.skip");
      devRecordWatcherSkip(node, "stable", defaultContext);
      if ((node.state & Revalidate) !== 0) deliverRetainedValidation(node);
      return;
    }
  }
  if (node.compute === void 0) {
    if (false)
      observeRuntimeProjection16?.("projection.semantic.watcher.disposed.skip");
    node.state &= ~Both;
    devRecordWatcherSkip(node, "stable", defaultContext);
    return;
  }
  const compute = node.compute;
  if (false)
    observeRuntimeProjection16?.("projection.semantic.watcher.execute");
  if (false)
    observeRuntimeProjection16?.("projection.semantic.watcher.cleanup.check");
  const prevCleanup = (node.state & WatcherCleanupPending) !== 0 ? node.payload : null;
  if (false)
    devRecordWatcherStart(node, prevCleanup !== null, defaultContext);
  node.state &= ~(Visited | Revalidate);
  if (prevCleanup !== null) {
    node.payload = void 0;
    node.state &= ~WatcherCleanupPending;
    try {
      runCleanup(prevCleanup);
    } catch (error) {
      recoverWatcherAfterComputationError(node);
      throw error;
    }
    devRecordWatcherCleanup(node, defaultContext);
    if (node.compute === void 0) {
      node.state &= ~Both;
      if (false) {
        devRecordWatcherFinish(node, false, void 0, defaultContext);
      }
      return;
    }
  }
  let result;
  try {
    result = executeKnownNodeComputation(node, compute);
  } catch (error) {
    recoverWatcherAfterComputationError(node);
    throw error;
  }
  if (node.compute === void 0) {
    node.payload = void 0;
    node.state &= ~WATCHER_TRANSIENT_STATE;
    return;
  }
  const hasCleanup = typeof result === "function";
  if (hasCleanup) {
    node.payload = result;
    node.state |= WatcherCleanupPending;
  }
  if ((node.state & (Visited | Revalidate)) === 0) {
    node.state &= ~Both;
  } else {
    retainAfterExecution(node);
  }
  devRecordWatcherFinish(node, hasCleanup, result, defaultContext);
  if (false)
    observeRuntimeProjection16?.("projection.semantic.watcher.execute.exit");
}
function disposeWatcher(node) {
  devAssertNoRuntimeHookTopologyMutation();
  if (false)
    observeRuntimeProjection16?.("projection.semantic.watcher.dispose");
  const cleanup = (node.state & WatcherCleanupPending) !== 0 ? node.payload : null;
  disposeNode(node);
  node.state &= ~(WATCHER_TRANSIENT_STATE | WatcherCleanupPending);
  if (cleanup !== null) {
    runCleanup(cleanup);
  }
  node.payload = void 0;
  devRecordWatcherDispose(node, cleanup !== null, defaultContext);
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/internal/process.ts
function getCurrentComputedInternal() {
  const node = currentConsumer;
  return node ? node.compute !== null && (node.state & Watcher) === 0 ? node : void 0 : void 0;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/protocol/create.node.ts
var createProducer = (payload) => {
  const node = new node_default(
    payload,
    void 0,
    PRODUCER_INITIAL_STATE
  );
  devRecordNodeCreated(node, defaultContext);
  return node;
};
var createConsumer = (callback) => {
  const node = new node_default(
    void 0,
    callback,
    CONSUMER_INITIAL_STATE
  );
  devRecordNodeCreated(node, defaultContext);
  return node;
};
var createWatcher = (callback) => {
  const node = new node_default(
    void 0,
    callback,
    WATCHER_INITIAL_STATE
  );
  devRecordNodeCreated(node, defaultContext);
  return node;
};

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/protocol/read.producer.ts
function readProducer(node) {
  devAssertNoRuntimeHookReactiveRead();
  if (false)
    observeRuntimeProjection17?.("projection.semantic.read.producer.invoke");
  const value = node.payload;
  const consumer = currentConsumer;
  if (consumer !== null) {
    if (false)
      observeRuntimeProjection17?.("projection.semantic.read.producer.track");
    resolveTrackedRead(node, consumer);
  }
  devRecordReadProducer(node, value, defaultContext);
  return value;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/protocol/utils/constants.ts
var LAZY = 1 << 0;
var EAGER = 1 << 1;
var ConsumerReadMode = {
  lazy: LAZY,
  eager: EAGER
};

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/protocol/read.consumer.ts
function readConsumerLazy() {
  devAssertNoRuntimeHookReactiveRead();
  if (false)
    observeRuntimeProjection18?.("projection.semantic.read.consumer.invoke");
  if (false)
    observeRuntimeProjection18?.("projection.semantic.read.consumer.lazy");
  const node = this;
  const state = node.state;
  if (false) observeRuntimeReadConsumerPath?.((state & Both) !== 0);
  if ((state & Both) !== 0) stabilizeDirtyConsumer(node, state);
  const consumer = currentConsumer;
  const payload = node.payload;
  if (consumer !== null) {
    if (false)
      observeRuntimeProjection18?.("projection.semantic.read.consumer.track");
    resolveTrackedRead(node, consumer);
  }
  devRecordReadConsumer(node, "lazy", payload, defaultContext, consumer);
  return payload;
}
function readConsumerEager(node) {
  devAssertNoRuntimeHookReactiveRead();
  if (false)
    observeRuntimeProjection18?.("projection.semantic.read.consumer.invoke");
  if (false)
    observeRuntimeProjection18?.("projection.semantic.read.consumer.eager");
  const state = node.state;
  if (false) observeRuntimeReadConsumerPath?.((state & Both) !== 0);
  if ((state & Both) !== 0) stabilizeDirtyConsumer(node, state);
  const payload = node.payload;
  devRecordReadConsumer(node, "eager", payload, defaultContext);
  return payload;
}
function readConsumer(node, mode = LAZY) {
  if (mode !== LAZY) return readConsumerEager(node);
  devAssertNoRuntimeHookReactiveRead();
  if (false)
    observeRuntimeProjection18?.("projection.semantic.read.consumer.invoke");
  if (false)
    observeRuntimeProjection18?.("projection.semantic.read.consumer.lazy");
  const state = node.state;
  if (false) observeRuntimeReadConsumerPath?.((state & Both) !== 0);
  if ((state & Both) !== 0) stabilizeDirtyConsumer(node, state);
  const consumer = currentConsumer;
  const payload = node.payload;
  if (consumer !== null) {
    if (false)
      observeRuntimeProjection18?.("projection.semantic.read.consumer.track");
    resolveTrackedRead(node, consumer);
  }
  devRecordReadConsumer(node, "lazy", payload, defaultContext, consumer);
  return payload;
}
var FORCE_RECOMPUTE_STATE = Changed | Visited;
function stabilizeDirtyConsumer(node, state) {
  devAssertConsumerCanStabilize(state);
  if ((state & FORCE_RECOMPUTE_STATE) !== 0) {
    if (false)
      observeRuntimeProjection18?.(
        "projection.semantic.read.stabilize.force-advance"
      );
    advance(node, ownedParentEdgeForStableRead(node));
  } else {
    const edge = node.firstIn;
    if (false)
      observeRuntimeProjection18?.(
        "projection.semantic.read.stabilize.pull-advance"
      );
    if (edge === null) {
      node.state &= ~Unknown;
    } else if (should_recompute(node, edge) === true) {
      advance(node, null);
    }
  }
  if ((runtimeState & 8 /* IdlePending */) !== 0 /* Idle */) {
    flushPendingRuntimeIdle();
  }
}
function ownedParentEdgeForStableRead(producer) {
  const consumer = currentConsumer;
  if (consumer === null || consumer === producer || (consumer.state & Computing) === 0) {
    return null;
  }
  const cursor = consumer.tailIn;
  const candidate = cursor === null ? consumer.firstIn : cursor.nextIn;
  return candidate !== null && candidate.from === producer ? candidate : null;
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/protocol/write.producer.ts
function sameWrittenValue(a, b) {
  return a === b ? a !== 0 || 1 / a === 1 / b : a !== a && b !== b;
}
function writeProducer(node, value) {
  if (false)
    observeRuntimeProjection19?.("projection.semantic.write.invoke");
  const prev = node.payload;
  if (sameWrittenValue(prev, value) === true) {
    if (false)
      observeRuntimeProjection19?.("projection.semantic.write.value.same");
    devRecordWriteProducer(node, false, value, prev, void 0, defaultContext);
    return;
  }
  node.payload = value;
  if (false)
    observeRuntimeProjection19?.("projection.semantic.write.value.changed");
  devRecordWriteProducer(node, true, value, prev, void 0, defaultContext);
  const firstOut = node.firstOut;
  if (firstOut === null) {
    if (false)
      observeRuntimeProjection19?.("projection.semantic.write.subscribers.empty");
    if (propagationScopeDepth === 0) emitSettledIfIdle();
    return;
  }
  if (propagationScopeDepth !== 0) {
    if (false)
      observeRuntimeProjection19?.(
        "projection.semantic.write.propagation.nested"
      );
    push_iterator(firstOut);
    return;
  }
  enterPropagationScope();
  try {
    push_iterator(firstOut);
  } catch (error) {
    abortPropagationScope();
    throw error;
  }
  leavePropagationScope();
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/protocol/utils/untracked.ts
function untracked(fn) {
  const prev = currentConsumer;
  setCurrentConsumer(null);
  try {
    return fn();
  } finally {
    setCurrentConsumer(prev);
  }
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/protocol/integration.ts
function isTracking() {
  return currentConsumer !== null;
}
function isContextSettled(context = getActiveRuntimeContext()) {
  if (context !== getActiveRuntimeContext()) {
    return context.propagationScopeDepth === 0 && context.currentConsumer === null;
  }
  return propagationScopeDepth === 0 && currentConsumer === null;
}
function hasObservers(node) {
  return node.firstOut !== null;
}
function disposeNodeIfUnobserved(node) {
  if (node.firstOut !== null) return false;
  disposeNode(node);
  return true;
}
function suspendConsumerIfUnobserved(node) {
  if (node.firstOut !== null) return false;
  unlinkAllSources(node);
  node.state = CONSUMER_INITIAL_STATE;
  node.payload = void 0;
  return true;
}
function hasPendingValidation(node) {
  return (node.state & Both) !== 0;
}
function takeScheduledWatcher(node) {
  if (false)
    observeRuntimeProjection20?.("projection.semantic.watcher.schedule.release");
  node.state &= ~Scheduled;
  return node.compute !== void 0;
}
function shouldRetryWatcherAfterFailure(node) {
  return (node.state & Both) !== 0;
}
function invalidateWatcher(node) {
  node.state |= Changed;
  emitNodeInvalidated(node);
}
function settleRuntimeIdle() {
  if ((runtimeState & 8 /* IdlePending */) !== 0 /* Idle */)
    flushPendingRuntimeIdle();
}

// C:/Users/User/AppData/Local/Temp/reflex-oracle-ADPI3b/pkg/src/domain/domain.ts
var OPEN = 0;
var CLOSING = 1;
var CLOSED = 2;
var ExecutionDomainState = {
  Open: OPEN,
  Closing: CLOSING,
  Closed: CLOSED
};
var ExecutionDomainClosedError = class extends Error {
  constructor() {
    super("The execution domain is closed.");
    this.name = "ExecutionDomainClosedError";
  }
};
var domains = /* @__PURE__ */ new WeakMap();
function getExecutionDomain(context) {
  return domains.get(context);
}
function getActiveExecutionDomain() {
  return domains.get(getActiveRuntimeContext());
}
function reportTeardownError(error) {
  console.error("Execution domain teardown error:", error);
}
function compose(first, second) {
  if (typeof first !== "function") first = void 0;
  if (typeof second !== "function") second = void 0;
  if (first === void 0) return second;
  if (second === void 0) return first;
  return (...args) => {
    first(...args);
    second(...args);
  };
}
function throwCollected(errors) {
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(errors, "Reactive batch failed");
}
function leaveBatchAfterError(scheduler, error) {
  const errors = [error];
  try {
    scheduler.leaveBatch?.();
  } catch (leaveError) {
    errors.push(leaveError);
  }
  try {
    leaveReactiveBatch();
  } catch (leaveError) {
    errors.push(leaveError);
  }
  return throwCollected(errors);
}
function leaveReactiveBatchAfterError(error) {
  const errors = [error];
  try {
    leaveReactiveBatch();
  } catch (leaveError) {
    errors.push(leaveError);
  }
  return throwCollected(errors);
}
var VIEW = Symbol("ExecutionDomain.view");
var viewOf = (domain) => domain[VIEW];
var domainPrototype = {
  get state() {
    return viewOf(this).state();
  },
  get closed() {
    return viewOf(this).state() !== OPEN;
  },
  get signal() {
    return viewOf(this).signal();
  },
  get depth() {
    return viewOf(this).depth();
  }
};
function createDomainObject(context, view, operations) {
  const domain = Object.create(domainPrototype);
  Object.assign(domain, { context }, operations, { [VIEW]: view });
  return domain;
}
function createExecutionDomain(options = {}) {
  const context = createRuntimeContext(
    options.readTrackingStrategy === void 0 ? {} : { readTrackingStrategy: options.readTrackingStrategy }
  );
  const scheduler = typeof options.scheduler === "function" ? options.scheduler(context) : options.scheduler ?? {};
  const onTeardownError = options.onTeardownError ?? reportTeardownError;
  const hooks = options.hooks;
  context.nodeInvalidatedHook = compose(
    scheduler.onNodeInvalidated,
    hooks?.onNodeInvalidated
  );
  context.runtimeIdleHook = compose(
    scheduler.onRuntimeIdle,
    hooks?.onRuntimeIdle
  );
  context.hostFlushHook = compose(scheduler.onHostFlush, void 0);
  let state = OPEN;
  let depth = 0;
  let controller;
  const pendingTeardown = [];
  let draining = false;
  const enter = (fn) => getActiveRuntimeContext() === context ? fn() : runWithRuntimeContext(context, fn);
  const drain = () => {
    if (draining) return;
    draining = true;
    try {
      enter(() => {
        while (pendingTeardown.length !== 0) {
          const task = pendingTeardown.shift();
          try {
            task();
          } catch (error) {
            onTeardownError(error);
          }
        }
      });
    } finally {
      draining = false;
    }
  };
  const finalize = () => {
    drain();
    state = CLOSED;
    configureRuntimeContext(context, {
      hooks: {},
      scheduler: {}
    });
  };
  const leaveSafePoint = () => {
    if (pendingTeardown.length !== 0) drain();
    if (state === CLOSING) finalize();
  };
  const enterManaged = () => {
    if (state === CLOSED) {
      throw new ExecutionDomainClosedError();
    }
    ++depth;
    return getActiveRuntimeContext() === context ? null : enterRuntimeContextRegion(context);
  };
  const leaveManaged = (previous) => {
    try {
      if (previous !== null) leaveRuntimeContextRegion(previous);
    } finally {
      if (--depth === 0 && (pendingTeardown.length !== 0 || state === CLOSING))
        leaveSafePoint();
    }
  };
  const run = (fn) => {
    const previous = enterManaged();
    try {
      return fn();
    } finally {
      leaveManaged(previous);
    }
  };
  const enterBatch = () => {
    const previous = enterManaged();
    try {
      enterReactiveBatch();
      scheduler.enterBatch?.();
    } catch (error) {
      leaveManaged(previous);
      throw error;
    }
    return previous;
  };
  const leaveBatch = (previous) => {
    try {
      try {
        scheduler.leaveBatch?.();
      } catch (error) {
        leaveReactiveBatchAfterError(error);
      }
      leaveReactiveBatch();
    } finally {
      leaveManaged(previous);
    }
  };
  const leaveBatchFailed = (previous, error) => {
    try {
      return leaveBatchAfterError(scheduler, error);
    } finally {
      leaveManaged(previous);
    }
  };
  const defaultBatch = (fn) => {
    const previous = enterBatch();
    let result;
    try {
      result = fn();
    } catch (error) {
      return leaveBatchFailed(previous, error);
    }
    leaveBatch(previous);
    return result;
  };
  const customBatch = scheduler.batch;
  const batch = customBatch === void 0 ? defaultBatch : (fn) => run(() => customBatch(fn));
  const flushImpl = scheduler.flush;
  const domain = createDomainObject(
    context,
    {
      state: () => state,
      depth: () => depth,
      signal() {
        if (controller === void 0) {
          controller = new AbortController();
          if (state !== OPEN) controller.abort();
        }
        return controller.signal;
      }
    },
    {
      run,
      batch,
      flush() {
        if (state === CLOSED || flushImpl === void 0) {
          return;
        }
        run(flushImpl);
      },
      hasPending() {
        return state !== CLOSED ? scheduler.hasPending?.() ?? false : false;
      },
      teardown(fn) {
        if (depth === 0 && !draining) {
          enter(fn);
          return;
        }
        pendingTeardown.push(fn);
      },
      close() {
        if (state !== OPEN) return;
        state = CLOSING;
        try {
          scheduler.release?.();
        } finally {
          controller?.abort();
          if (depth === 0) finalize();
        }
      }
    }
  );
  domains.set(context, domain);
  return domain;
}
export {
  Both,
  CONSUMER_INITIAL_STATE,
  Changed,
  Computing,
  Consumer,
  ConsumerReadMode,
  DEFAULT_READ_TRACKING_STRATEGY,
  Disposed,
  EAGER,
  ExecutionDomainClosedError,
  ExecutionDomainState,
  LAZY,
  Leased,
  None,
  PRODUCER_INITIAL_STATE,
  Producer,
  RUNTIME_EXECUTION_FRAMES_ENABLED,
  node_default as ReactiveNode,
  Revalidate,
  RuntimeExecutionError,
  RuntimePhase,
  RuntimeState,
  STACK_TRIM_MIN_CAPACITY,
  Scheduled,
  Unknown,
  Visited,
  WATCHER_INITIAL_STATE,
  Watcher,
  WatcherCleanupPending,
  abortPropagationScope,
  currentConsumer as activeTracking,
  advance,
  advanceTrackingStamp,
  cancelHostFlushRequest,
  claimWatcherSchedule,
  cleanupUnvisitedSources,
  clearHostWorkPending,
  clearRuntimeIdlePending,
  compare,
  configureRuntimeContext,
  createConsumer,
  createExecutionDomain,
  createProducer,
  createReactiveEdge,
  createRuntimeContext,
  createWatcher,
  currentConsumer,
  defaultContext,
  devAssertNoRuntimeHookReactiveRead,
  devAssertNoRuntimeHookTopologyMutation,
  devAssertNoRuntimeHookWatcherExecution,
  devAssertRuntimeHookDidNotReenter,
  disposeNode,
  disposeNodeEvent,
  disposeNodeIfUnobserved,
  disposeWatcher,
  emitNodeInvalidated,
  emitRuntimeIdle,
  emitRuntimeIdleWithBatching,
  emitSettledIfIdle,
  enterConsumerTracking,
  enterPropagationScope,
  enterPropagationScopeRegister,
  enterReactiveBatch,
  enterReactiveBatchRegister,
  enterRuntimeContextRegion,
  enterRuntimeHook,
  enterRuntimePhase,
  findEdgeInLockstep,
  flushPendingRuntimeIdle,
  getActiveExecutionDomain,
  getActiveRuntimeContext,
  getCurrentComputedInternal,
  getExecutionDomain,
  hasObservers,
  hasPendingValidation,
  hostFlushHook,
  invalidateWatcher,
  isContextSettled,
  isNewerEpoch,
  isOutgoingHint,
  isReactiveBatchActive,
  isRuntimeContextSuspended,
  isRuntimeExecutionIdle,
  isTracking,
  keepNewestTrackingStamp,
  leavePropagationScope,
  leavePropagationScopeRegister,
  leaveReactiveBatch,
  leaveReactiveBatchRegister,
  leaveRuntimeContextRegion,
  leaveRuntimeHook,
  leaveRuntimePhase,
  linkEdge,
  loadRuntimeConfiguration,
  loadRuntimeExecutionFrame,
  markHostWorkPending,
  markRuntimeIdlePending,
  moveIncomingEdgeAfterUnchecked,
  moveLastIncomingEdgeAfterEdgeUnchecked,
  moveLastIncomingEdgeToFrontUnchecked,
  moveMiddleIncomingEdgeAfterEdgeUnchecked,
  moveNonHeadIncomingEdgeToFrontUnchecked,
  nodeInvalidatedHook,
  noteResumeEdgeStackUsage,
  noteShouldRecomputeStackUsage,
  push_iterator as propagate,
  propagationScopeDepth,
  pull_dependency,
  pull_frontier,
  push_iterator,
  push_iterator_once,
  push_iterator_once_skipping,
  reactiveBatchDepth,
  readActiveRuntimeHook,
  readConsumer,
  readConsumerEager,
  readConsumerLazy,
  readProducer,
  readPropagateStackStats,
  readRuntimePhase,
  readRuntimeWalkerStackStats,
  readShouldRecomputeStackStats,
  readTrackingStrategy,
  releaseWatcherSchedule,
  requestHostFlush,
  resetRuntimeContext,
  resetRuntimeExecutionState,
  resetRuntimeWalkerStackStats,
  resolveTrackedRead,
  restoreConsumerTracking,
  restoreRuntimeContextSnapshot,
  reuseIncomingEdgeFromSuffixOrCreate,
  reuseIncomingEdgeFromSuffixOrLink,
  reuseLocatedIncomingEdgeOrLink,
  runWatcher,
  runWatcherWithoutSettledCheckpoint,
  runWithRuntimeContext,
  runtimeIdleHook,
  runtimeState,
  saveRuntimeExecutionFrame,
  setCurrentConsumer,
  setPropagationScopeDepth,
  setReactiveBatchState,
  setRuntimeState,
  setTrackingStamp,
  settleRuntimeIdle,
  shouldRetryWatcherAfterFailure,
  should_recompute,
  snapshotRuntimeContext,
  suspendConsumerIfUnobserved,
  switchRuntimeContext,
  syncRuntimeContext,
  takeScheduledWatcher,
  trackRead,
  trackingStamp,
  trimWalkerStackIfSparse,
  trimWalkerStackToFloorIfSparse,
  unlinkAllSources,
  unlinkAllSubscribers,
  unlinkDetachedIncomingEdgeSequence,
  unlinkEdge,
  untracked,
  writeProducer
};
