import { beginComputation, endComputation } from "../../execution";
import { ReactiveNode } from "../shape";
import { commitConsumer } from "./commitConsumer";

export function recompute(consumer: ReactiveNode): boolean {
  const compute = consumer.compute!;

  beginComputation(consumer);

  let changed: boolean;

  try {
    changed = commitConsumer(consumer, compute());
  } catch (err) {
    changed = commitConsumer(consumer, undefined, err);
  } finally {
    endComputation();
  }

  return changed!;
}

export default recompute;
