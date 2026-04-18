import { recordDebugEvent, collectDebugNodeRefs } from "../debug/debug.impl";
import { activeComputed, type ExecutionContext } from "./context";
import { type ReactiveEdge, ReactiveNodeState } from "./shape";
import type ReactiveNode from "./shape/ReactiveNode";

export function devAssertTrackReadAlive(
  sourceDead: boolean,
  consumerDead: boolean,
): void {
  if (!__DEV__) return;
  if (sourceDead) throw new Error("track from dead source");
  if (consumerDead) throw new Error("track into dead consumer");
}

export function devRecordTrackRead(
  context: ExecutionContext,
  consumer: ReactiveNode,
  source: ReactiveNode,
): void {
  if (!__DEV__) return;

  recordDebugEvent(context, "track:read", {
    consumer,
    source,
  });
}

export function devRecordCleanupStaleSources(
  node: ReactiveNode,
  staleHead: ReactiveEdge,
  context: ExecutionContext,
): void {
  if (!__DEV__) return;

  const removedSources = collectDebugNodeRefs(
    staleHead,
    (edge) => edge.from,
    (edge) => edge.nextIn,
  );

  recordDebugEvent(context, "cleanup:stale-sources", {
    node,
    detail: {
      removedCount: removedSources.length,
      removedSources,
    },
  });
}

export function devAssertRecomputeAlive(): void {
  if (__DEV__) {
    throw new Error("recompute dead node");
  }
}

export function devRecordRecompute(
  node: ReactiveNode,
  changed: boolean,
  next: unknown,
  previous: unknown,
  context: ExecutionContext,
): void {
  if (!__DEV__) return;

  recordDebugEvent(context, "recompute", {
    node,
    detail: {
      changed,
      next,
      previous,
    },
  });
}

export function devAssertReadDeadProducer(): void {
  if (__DEV__) {
    throw new Error("read from dead producer");
  }
}

export function devAssertReadDeadConsumer(): void {
  if (__DEV__) {
    throw new Error("read dead consumer");
  }
}

export function devAssertConsumerCanStabilize(state: number): void {
  if (__DEV__ && (state & ReactiveNodeState.Computing) !== 0) {
    throw new Error("Cycle detected while refreshing reactive graph");
  }
}

export function devRecordReadProducer(
  node: ReactiveNode,
  value: unknown,
  context: ExecutionContext,
): void {
  if (!__DEV__) return;

  recordDebugEvent(context, "read:producer", {
    consumer: activeComputed ?? undefined,
    node,
    detail: {
      value,
    },
  });
}

export function devRecordReadConsumer(
  node: ReactiveNode,
  mode: "eager" | "lazy",
  value: unknown,
  context: ExecutionContext,
  consumer?: ReactiveNode,
): void {
  if (!__DEV__) return;

  recordDebugEvent(context, "read:consumer", {
    consumer,
    node,
    detail: {
      mode,
      value,
    },
  });
}

export function devAssertWriteAlive(): void {
  if (__DEV__) {
    throw new Error("write into dead node");
  }
}

export function devRecordWriteProducer(
  node: ReactiveNode,
  changed: boolean,
  next: unknown,
  previous: unknown,
  hasSubscribers: boolean | undefined,
  context: ExecutionContext,
): void {
  if (!__DEV__) return;

  recordDebugEvent(context, "write:producer", {
    node,
    detail: {
      changed,
      next,
      previous,
      hasSubscribers,
    },
  });
}

export function devAssertShouldRecomputeAlive(): void {
  if (__DEV__) {
    throw new Error("shouldRecompute dead node");
  }
}

export function devAssertPropagateAlive(): void {
  if (__DEV__) {
    throw new Error("propagate from dead node");
  }
}
