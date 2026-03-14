import { ReactiveNode, CLEAR_INVALID } from "../../reactivity/shape";
import { clearDependencies } from "../../reactivity/shape/methods/connect";
import runtime from "../../runtime";
import { commitConsumer } from "./commitConsumer";

function reconcileDependencies(consumer: ReactiveNode) {
  clearDependencies(consumer);
}

export function recompute(consumer: ReactiveNode): boolean {
  reconcileDependencies(consumer);

  let changed: boolean = false;

  const compute = consumer.compute!;
  const current = runtime.beginComputation(consumer);

  try {
    const computedValue = compute();

    changed = commitConsumer(consumer, computedValue);
  } catch (err) {
    changed = commitConsumer(consumer, undefined, err);
  } finally {
    consumer.runtime &= CLEAR_INVALID;
    runtime.endComputation(current);
  }

  return changed;
}

export default recompute;
