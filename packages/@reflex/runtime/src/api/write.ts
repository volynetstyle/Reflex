import { commitProducer } from "../reactivity/producer/commitProducer";
import { ReactiveNodeState } from "../reactivity/shape";
import ReactiveNode from "../reactivity/shape/ReactiveNode";
import {  propagate } from "../reactivity/walkers/propagate";

// @__INLINE__
export function writeProducer<T>(producer: ReactiveNode, value: T): void {
  if (!commitProducer(producer, value)) return;

  propagate(producer, ReactiveNodeState.Obsolete);
}

// we newer write into consumer
