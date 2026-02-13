import {
  readComputed,
  readSignal,
  runEffect,
  writeSignal,
} from "../../src/reactivity/api";
import { NodeKind, NodeCausal } from "../../src/reactivity/shape/ReactiveMeta";
import ReactiveNode from "../../src/reactivity/shape/ReactiveNode";

type Signal<T> = [get: () => T, set: (value: T) => void];

export const signal = <T>(initialValue: T): Signal<T> => {
  const reactiveNode = new ReactiveNode(
    NodeKind.Signal | NodeCausal.Versioned,
    initialValue,
  );

  return [
    () => readSignal<T>(reactiveNode),
    (value) => void writeSignal(reactiveNode, value),
  ];
};

export const computed = <T>(fn: () => T): (() => T) => {
  const reactiveNode = new ReactiveNode(
    NodeKind.Computed | NodeCausal.Versioned,
    null as T,
    fn,
  );

  return () => readComputed<T>(reactiveNode);
};

export const effect = (fn: () => (() => void) | void): void => {
  const reactiveNode = new ReactiveNode(NodeKind.Effect, null, fn);

  runEffect(reactiveNode);
};
