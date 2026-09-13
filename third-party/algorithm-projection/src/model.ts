import type { CompilerOptions } from "typescript";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}
export interface CfgNode {
  id: string;
  reachable: boolean;
  kind: string;
  text?: string;
  location?: SourceLocation;
  next: string[];
  previous: string[];
}
export interface ControlFlowGraph {
  entry: string;
  exits: string[];
  nodes: CfgNode[];
}
export interface LoopFact {
  kind: "for" | "for-in" | "for-of" | "while" | "do-while";
  iterator?: string;
  condition?: string;
  update?: string;
  location: SourceLocation;
}
export interface BranchFact {
  kind: "if" | "switch" | "conditional";
  condition: string;
  location: SourceLocation;
}
export interface ReadEffect {
  target: string;
  type?: string;
  location: SourceLocation;
}
export interface WriteEffect {
  target: string;
  value: string;
  type?: string;
  guard?: string;
  location: SourceLocation;
}
export interface CallEffect {
  target: string;
  arguments: string[];
  location: SourceLocation;
}
export interface StateTransition {
  kind: "state-transition";
  target: string;
  from?: string;
  to: string;
  guard?: string;
  location: SourceLocation;
}
export interface LinkedTraversal {
  kind: "linked-traversal";
  variable: string;
  type?: string;
  start: string;
  continuation: string;
  termination: string;
  location: SourceLocation;
}
export interface StackCandidate {
  kind: "stack-candidate";
  storage: string;
  index: string;
  pushes: number;
  pops: number;
  location: SourceLocation;
}
export interface AlgorithmProjection {
  function: string;
  source: SourceLocation;
  cfg: ControlFlowGraph;
  loops: LoopFact[];
  branches: BranchFact[];
  effects: { reads: ReadEffect[]; writes: WriteEffect[]; calls: CallEffect[] };
  stateTransitions: StateTransition[];
  structures: {
    linkedTraversals: LinkedTraversal[];
    stackCandidates: StackCandidate[];
  };
}
export interface AnalyzeSourceOptions {
  fileName?: string;
  compilerOptions?: CompilerOptions;
}
export interface AnalyzeFileOptions {
  tsconfig?: string;
}
export type ObservationPointKind =
  | "function-entry"
  | "function-exit"
  | "loop-enter"
  | "loop-exit"
  | "branch-outcome"
  | "state-transition"
  | "stack-push"
  | "stack-pop";

export interface SourceEvidence {
  readonly kind:
    | "function"
    | "loop"
    | "branch"
    | "transition"
    | "resource"
    | "cfg-exit";
  readonly location: SourceLocation;
  readonly expression?: string;
  readonly cfgNode?: string;
}

export interface ObservationPoint {
  readonly id: string;
  readonly space: "raw" | "semantic";
  readonly fingerprint: string;
  readonly function: string;
  readonly kind: ObservationPointKind;
  readonly evidence: readonly SourceEvidence[];
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface InstrumentationPlan {
  readonly function: string;
  readonly points: readonly ObservationPoint[];
}
