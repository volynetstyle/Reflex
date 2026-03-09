import { GlobalClock } from "../../runtime";
import { ReactiveNode } from "../shape";
import { PackedClock } from "../shape/methods/pack";
import { changePayload, markFailed } from "../shape/ReactivePayload";

/**
 * Фиксирует результат compute():
 *   - обновляет computedAt (версия последнего успешного вычисления)
 *   - если значение изменилось — мутирует changedAt через changePayload
 *   - возвращает true если downstream нужно инвалидировать
 *
 * Заменяет старый commitConsumer + ручной CLEAR_INVALID.
 */
export function commitConsumer(
  consumer: ReactiveNode,
  next: unknown,
  error?: unknown,
): boolean {

  if (error !== undefined) {
    markFailed(consumer, error);
    // computedAt не выставляем — узел не вычислен успешно
    return true;
  }

  if (consumer.payload === next) {
    // Мемоизация — фиксируем что проверили, значение то же
    consumer.computedAt = GlobalClock.current;
    return false;
  }

  // Сначала меняем payload (tick внутри changePayload)
  changePayload(consumer, next);
  // computedAt = версия ЭТОГО изменения, чтобы downstream видел:
  // dep.changedAt.version === node.computedAt → "я пересчитан до этого dep"
  consumer.computedAt = PackedClock.version(consumer.changedAt);
  return true;
}