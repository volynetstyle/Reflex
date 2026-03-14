import {
  linkSourceToObserverUnsafe,
  unlinkAllSourcesUnsafe,
  unlinkEdgeUnsafe,
} from "@reflex/core";
import ReactiveNode from "../ReactiveNode";
import { ReactiveEdge } from "../ReactiveEdge";
import runtime from "../../../runtime";
import { insertPeer, removePeer } from "../../walkers/order_maintenance";

export function connect(producer: ReactiveNode, consumer: ReactiveNode) {
  insertPeer(producer, consumer);

  return linkSourceToObserverUnsafe(producer, consumer, ReactiveEdge);
}

export function clearSubscribers(producer: ReactiveNode) {
  let edge = producer.firstOut;

  while (edge !== null) {
    const next = edge.nextOut;

    removePeer(edge.to);
    unlinkEdgeUnsafe(edge);

    edge = next;
  }
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
