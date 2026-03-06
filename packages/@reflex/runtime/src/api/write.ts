import { commitProducer } from "../reactivity/producer/commitProducer";
import ReactiveNode from "../reactivity/shape/ReactiveNode";
import { propagate } from "../reactivity/walkers/propagateFrontier";

// @__INLINE__
export function writeProducer<T>(producer: ReactiveNode, value: T): void {
  if (!commitProducer(producer, value)) return;

  propagate(producer, true);
}

// we newer write into consumer
