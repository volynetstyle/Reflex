import runtime from "../../runtime";
import { CLEAR_INVALID, ReactiveNode } from "../shape";
import { clearDependencies } from "../shape/methods/connect";
import { commitConsumer } from "./commitConsumer";

export function recompute(consumer: ReactiveNode): boolean {
  clearDependencies(consumer);

  let changed: boolean = false;

  const compute = consumer.compute!;
  const current = runtime.beginComputation(consumer);

  try {
    changed = commitConsumer(consumer, compute());
  } catch (err) {
    changed = commitConsumer(consumer, undefined, err);
  } finally {
    consumer.runtime &= CLEAR_INVALID;
    runtime.endComputation(current);
  }

  return changed;
}

export default recompute;
