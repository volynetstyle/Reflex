// shape/ReactivePayload.ts
import { GlobalClock } from "../../runtime";
import { PackedClock } from "./methods/pack";
import { ReactiveNode } from "./ReactiveNode";

/**
 * Мутирует payload и фиксирует версию изменения.
 * changedAt = pack(globalClock.tick(), queued, failed).
 *
 * Инвариант: вызывается только если payload действительно изменился.
 */
export function changePayload<T>(node: ReactiveNode<T>, next: T): void {
  node.payload = next;
  node.changedAt = PackedClock.pack(
    GlobalClock.tick(),
    PackedClock.isQueued(node.changedAt),
    false, // сброс Failed при успешном обновлении
  );
}

export function markFailed(node: ReactiveNode, error: unknown): void {
  node.payload = error as any;
  node.changedAt = PackedClock.pack(
    GlobalClock.tick(),
    PackedClock.isQueued(node.changedAt),
    true,
  );
}
