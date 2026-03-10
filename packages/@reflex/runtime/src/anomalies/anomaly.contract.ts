/**
 * Anomalies exist - that means do not cause any errors except errors.
 * This is a significant difference, because in our execution conditions, errors are unnatural.
 * There is no point in denying them, you can only learn to coexist with them.
 *
 * In a reactive causal system, deviations from expected execution contexts, temporal alignment,
 * or structural assumptions are normal and unavoidable.
 * Such deviations must be explicitly represented as anomalies that preserve causal correctness,
 * do not mutate system state, and remain observable to the user.
 */
interface Anomaly {
  readonly kind: "Error" | "Exception" | "Anomaly";

  /**
   * Не влияет на continuation рантайма
   */
  readonly fatal: false;

  /**
   * Не нарушает t/p инварианты
   */
  readonly causalSafe: true;

  /**
   * Не участвует в propagation
   */
  readonly reactive: false;
}
