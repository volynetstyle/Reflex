// import { ReactiveNode } from "../core";

// /**
//  * Anomalies exist - that means do not cause any errors except errors.
//  * This is a significant difference, because in our execution conditions, errors are unnatural.
//  * There is no point in denying them, you can only learn to coexist with them.
//  *
//  * In a reactive causal system, deviations from expected execution contexts, temporal alignment,
//  * or structural assumptions are normal and unavoidable.
//  * Such deviations must be explicitly represented as anomalies that preserve causal correctness,
//  * do not mutate system state, and remain observable to the user.
//  */
// type RuntimePhase =
//   | "read"
//   | "write"
//   | "compute"
//   | "commit"
//   | "flush"
//   | "dispose";

// type RuntimeAnomalyCode =
//   | "dependency_cycle"
//   | "illegal_write_during_compute"
//   | "stale_version_commit"
//   | "reentrant_execution"
//   | "disposed_node_access"
//   | "selector_key_instability"
//   | "priority_inversion"
//   | "scope_leak";

// interface RuntimeAnomaly {
//   readonly kind: "anomaly";
//   readonly code: RuntimeAnomalyCode;
//   readonly phase: RuntimePhase;
//   readonly epoch: number;
//   readonly runtimeId: number;
//   readonly node?: ReactiveNode;
//   readonly message: string;
//   readonly cause?: unknown;

//   readonly fatal: false;
//   readonly causalSafe: true;
//   readonly reactive: false;

//   readonly severity: "info" | "warn" | "error";
//   readonly disposition:
//     | "reported"
//     | "suppressed"
//     | "blocked"
//     | "ignored"
//     | "recovered";
// }

// interface RuntimeDiagnosticPolicy {
//   onIllegalWriteDuringCompute: "report" | "block" | "throw";
//   onDisposedNodeAccess: "report" | "ignore" | "throw";
//   onReentrantFlush: "report" | "suppress" | "throw";
//   onCycleDetected: "report" | "block" | "throw";
// }

// interface RuntimeOptions {
//   diagnostics?: RuntimeDiagnosticsSink;
//   diagnosticPolicy?: Partial<RuntimeDiagnosticPolicy>;
// }

// // interface RuntimeDiagnosticsSink {
// //   onAnomaly?(event: RuntimeAnomaly): void;
// //   onException?(event: RuntimeException): void;
// //   onInternalError?(event: RuntimeInternalError): void;
// // }
