import { ReactiveNodeState } from "../reactivity/shape";
import ReactiveNode from "../reactivity/shape/ReactiveNode";
import { changePayload } from "../reactivity/shape/ReactivePayload";
import { propagate } from "../reactivity/walkers/propagate";

// @__INLINE__
export function writeProducer<T>(producer: ReactiveNode, value: T): void {
  if (producer.payload === value) return;

  changePayload(producer, value);

  propagate(producer, ReactiveNodeState.Obsolete);
}

// we newer write into consumer
