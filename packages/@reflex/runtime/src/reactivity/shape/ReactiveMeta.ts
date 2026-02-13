export const enum NodeKind {
  Signal = 0x0,
  Computed = 0x1,
  Effect = 0x2,
  Root = 0x3,
  Resource = 0x4,
  Firewall = 0x5,
  Envelope = 0x6,
}

export const enum NodeRuntime {
  Dirty = 1 << 4, // cache invalid
  Computing = 1 << 5, // recursion guard
  Scheduled = 1 << 6, // enqueued for execution
  HasError = 1 << 7, // error boundary active
}

export const enum NodeStructure {
  DynamicDeps = 1 << 8, // deps may change
  TopoBarrier = 1 << 9, // stop traversal skipping
  OwnedByParent = 1 << 10, // lifecycle ownership
  HasCleanup = 1 << 11, // disposer exists
}

export const enum NodeCausal {
  AsyncBoundary = 1 << 12, // async splits logical time
  Versioned = 1 << 13, // semantic versioning enabled
  TimeLocked = 1 << 14, // cannot recompute in same tick
  Structural = 1 << 15, // propagates structure changes

  // зарезервировано под будущее
  // 1 << 16
  // 1 << 17
  // 1 << 18
  // 1 << 19
  // 1 << 20
  // 1 << 21
  // 1 << 22
  // 1 << 23
}

// runtime flags MUST NOT affect causality
export const RUNTIME_MASK =
  NodeRuntime.Dirty |
  NodeRuntime.Computing |
  NodeRuntime.Scheduled |
  NodeRuntime.HasError;

// @__INLINE__
export const addFlags = (s: number, f: number) => s | f;

// @__INLINE__
export const dropFlags = (s: number, f: number) => s & ~f;

// @__INLINE__
export const hasFlags = (s: number, f: number) => (s & f) !== 0;
