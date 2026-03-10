import {
  linkSourceToObserverUnsafe,
  unlinkAllObserversUnsafe,
  unlinkAllSourcesUnsafe,
} from "@reflex/core";
import ReactiveNode from "../ReactiveNode";
import { ReactiveEdge } from "../ReactiveEdge";
import runtime from "../../../runtime";

export function connect(producer: ReactiveNode, consumer: ReactiveNode) {
  return linkSourceToObserverUnsafe(producer, consumer, ReactiveEdge);
}

export function clearSubscribers(producer: ReactiveNode) {
  unlinkAllObserversUnsafe(producer);
}

export function clearDependencies(consumer: ReactiveNode) {
  unlinkAllSourcesUnsafe(consumer);
}

/**
 * One-way bind from A -> B
 * @param producer
 * @returns void
 */
export function establish_dependencies_add(producer: ReactiveNode): void {
  const consumer = runtime.currentComputation;

  if (!consumer || producer === consumer) return;

  void connect(producer, consumer);
}

export function establish_subscribers_remove() {
  const consumer = runtime.currentComputation;

  if (!consumer) {
    return;
  }

  clearSubscribers(consumer);
}

export function establish_dependencies_remove() {
  const consumer = runtime.currentComputation;

  if (!consumer) {
    return;
  }

  clearDependencies(consumer);
}
