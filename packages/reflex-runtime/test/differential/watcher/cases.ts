import type { DifferentialCase, NodeId } from "../api";
import type { Evidence } from "./model";

export type DependencyId = "direct" | "stableDerived" | "failing";
export type WriteId = "direct" | "stable" | "failing";

export interface WatcherEvidenceCase extends DifferentialCase {
  readonly topology: "mixed-2" | "mixed-3";
  readonly readOrder: readonly DependencyId[];
  readonly writeOrder: readonly WriteId[];
  readonly incomingEvidence: readonly Evidence[];
  readonly expectedEvidence: Evidence;
}

export interface WatcherEvidenceTopology {
  readonly dependencies: readonly DependencyId[];
  readonly writes: Readonly<Record<WriteId, NodeId>>;
}
