import { GlobalClock } from "../../runtime";
import { ReactiveNode } from "../shape";
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
  // Фиксируем момент вычисления в любом случае
  consumer.computedAt = GlobalClock.current;

  if (error !== undefined) {
    markFailed(consumer, error);
    return true; // ошибка всегда propagate
  }

  if (consumer.payload === next) {
    // Мемоизация: значение не изменилось, changedAt не трогаем
    return false;
  }

  changePayload(consumer, next);
  return true;
}
