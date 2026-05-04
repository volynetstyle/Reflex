import type { RuntimeDebugNodeRef } from "@volynets/reflex/debug";

export const RUNTIME_GRAPH_HISTORY_LIMIT = 80;
export const RUNTIME_HISTORY_PANEL_LIMIT = 30;
export const RUNTIME_SESSION_HISTORY_LIMIT = 500;

export const RUNTIME_LAYER_FALLBACK_HEIGHT = "420px";
export const RUNTIME_INITIAL_HIGHLIGHT_DELAY_MS = 40;

export const RUNTIME_LAYOUT_DEFAULTS = {
  siblingGap: 150,
  levelGap: 140,
  originX: 80,
  originY: 80,
  incremental: true,
} as const;

export const RUNTIME_LAYOUT_POSITION_EPSILON = 0.5;

export const RUNTIME_GRAPH_VIEW = {
  fitPadding: 32,
  nodeSize: 38,
  nodeBorderWidth: 2,
  nodeChangedBorderWidth: 4,
  dirtyBorderWidth: 3,
  edgeWidth: 2,
  activeEdgeWidth: 4,
  labelFontSize: 11,
  minZoomedLabelFontSize: 8,
  labelMarginY: 10,
  labelTextBackgroundOpacity: 0.72,
  edgeOpacity: 0.58,
} as const;

export const RUNTIME_GRAPH_TIMING = {
  tooltipVisibleMs: 900,
  tooltipRemoveMs: 350,
  nodeHighlightMs: 1100,
  edgeHighlightMs: 850,
  edgeHighlightStaggerMs: 180,
} as const;

export const RUNTIME_GRAPH_COLORS = {
  active: "#f8fafc",
  dirty: "#facc15",
  edge: "#475569",
  edgeArrow: "#64748b",
  label: "#e2e8f0",
  labelBackground: "#0f172a",
  nodeBorder: "#0f172a",
  nodeKinds: {
    consumer: "#60a5fa",
    producer: "#34d399",
    unknown: "#94a3b8",
    watcher: "#f59e0b",
  } satisfies Record<RuntimeDebugNodeRef["kind"], string>,
} as const;

export const RUNTIME_CYTOSCAPE_CLASSES = {
  activeEdge: "runtime-edge-active",
  changedNode: "runtime-node-changed",
  tooltip: "runtime-node-tip",
  tooltipHidden: "runtime-node-tip--hide",
} as const;
