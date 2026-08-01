import type { Expression } from "@swc/core";

export type StoreLeafPath = {
  initial: Expression;
  mangled: string;
  path: string;
  parts: string[];
};

export type StoreBinding = {
  name: string;
  branchPaths: Set<string>;
  leafPaths: Map<string, StoreLeafPath>;
  leaves: StoreLeafPath[];
};

export interface CompiledStorePathContext {
  path: readonly string[];
  mangledPath: string;
}

export interface CompiledStoreTemporaryContext {
  index: number;
  label: string;
}

export interface CompiledStoreLoweringTarget {
  runtimeModule: string;
  model: {
    exportName: string;
    localName: string;
    actionMethod: string;
  };
  signal: {
    exportName: string;
    localName: string;
  };
  identifiers: {
    context: string;
    value: string;
    read: (context: CompiledStorePathContext) => string;
    set: (context: CompiledStorePathContext) => string;
    write: (context: CompiledStorePathContext) => string;
    temporary: (context: CompiledStoreTemporaryContext) => string;
  };
}

export type CompiledStoreLoweringTargetOptions = {
  runtimeModule?: string;
  model?: Partial<CompiledStoreLoweringTarget["model"]>;
  signal?: Partial<CompiledStoreLoweringTarget["signal"]>;
  identifiers?: Partial<CompiledStoreLoweringTarget["identifiers"]>;
};

export type DiagnosticCode =
  | "dynamic-access"
  | "branch-alias"
  | "spread-reflection"
  | "delete"
  | "optional-chain";

export interface CompiledStoreDiagnostic {
  code: DiagnosticCode;
  message: string;
}

export interface CompiledStoreTransformOptions {
  /**
   * Emits the runtime import needed by generated code.
   *
   * Test harnesses can disable this and provide `__reflex_createModel` and
   * `__reflex_signal` in scope manually.
   */
  importRuntime?: boolean;
  /** Runtime facade used by generated code. */
  runtimeModule?: string;
  /** Customize every runtime symbol emitted by the canonical lowering. */
  loweringTarget?: CompiledStoreLoweringTargetOptions;
  /**
   * `throw` is the compiler default because unsupported store syntax should be
   * found during development, not discovered as a runtime semantic mismatch.
   */
  onDiagnostic?: "throw" | "collect";
}

export interface CompiledStoreTransformResult {
  code: string;
  diagnostics: CompiledStoreDiagnostic[];
  map: string | null;
}

export type TransformState = {
  diagnostics: CompiledStoreDiagnostic[];
  options: {
    importRuntime: boolean;
    onDiagnostic: "throw" | "collect";
  };
  target: CompiledStoreLoweringTarget;
  stores: Map<string, StoreBinding>;
  tempCounter: number;
};

export class CompiledStoreTransformError extends Error {
  readonly diagnostics: CompiledStoreDiagnostic[];

  constructor(diagnostics: CompiledStoreDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    this.name = "CompiledStoreTransformError";
    this.diagnostics = diagnostics;
  }
}
