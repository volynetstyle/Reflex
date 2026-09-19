import { Op } from "../harness";

export interface WatcherEvidenceCase {
  readonly id: string;
  readonly topology: "mixed-2" | "mixed-3";
  readonly readOrder: readonly DependencyId[];
  readonly writeOrder: readonly WriteId[];
  readonly program: readonly Op[];
}