// shape/ReactivePayload.ts
import { GlobalClock } from "../../runtime";
import { ReactiveNode } from "./ReactiveNode";

/**
 * Мутирует payload и фиксирует версию изменения.
 * changedAt = pack(globalClock.tick(), queued, failed).
 *
 * Инвариант: вызывается только если payload действительно изменился.
 */
export function changePayload<T>(node: ReactiveNode<T>, next: T): void {
  node.payload = next;
  node.changedAt = GlobalClock.tick()
}
