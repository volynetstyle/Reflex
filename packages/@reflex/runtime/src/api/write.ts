import { commitProducer } from "../reactivity/producer/commitProducer";
import { ReactiveNodeState } from "../reactivity/shape";
import ReactiveNode from "../reactivity/shape/ReactiveNode";
import { Traversal } from "../runtime";

// @__INLINE__
export function writeProducer<T>(producer: ReactiveNode, value: T): void {
  if (!commitProducer(producer, value)) return;
  Traversal.next(); // ← инвалидируем все verifiedAt одним инкрементом
}
// we newer write into consumer
