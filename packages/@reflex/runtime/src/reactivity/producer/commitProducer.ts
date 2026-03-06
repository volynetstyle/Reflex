import { ReactiveNode } from "../shape";
import { changePayload } from "../shape/payload";

// commit = state transition
// validation = strategy

// @__INLINE__
export function commitProducer<T>(producer: ReactiveNode<T>, next: T): boolean {
  if (producer.payload === next) return false; 

  changePayload(producer, next);
  return true;
}