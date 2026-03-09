import runtime from "../../runtime";
import { ReactiveNode } from "../shape";
import { clearDependencies } from "../shape/methods/connect";
import { commitConsumer } from "./commitConsumer";

export function recompute(consumer: ReactiveNode): boolean {
  clearDependencies(consumer);

  const compute = consumer.compute!;
  const current = runtime.beginComputation(consumer);

  let changed = false;

  try {
    changed = commitConsumer(consumer, compute());
  } catch (err) {
    changed = commitConsumer(consumer, undefined, err);
  } finally {
    runtime.endComputation(current);
  }

  return changed;
}

export default recompute;
