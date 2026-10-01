# Начало работы с reflex-dom

Сначала прочитайте [архитектуру и результаты исследования](ARCHITECTURE.ru.md),
затем [публичный API и команды](../README.md).

## Маршрут по коду

1. `src/client/renderer.ts` — render, hydrate, resume и явные runtime boundaries.
2. `src/client/roots.ts` — единственная регистрация корней, rollback и stale cleanup.
3. `src/runtime/context.ts` и `lifetime.ts` — синхронный контекст и framework ownership.
4. `src/mount/append.ts` — диспетчер renderable; `element.ts`, `for.ts`, `portal.ts` — операции.
5. `src/structure/owned-range.ts` и `content-slot.ts` — границы и время жизни DOM.
6. `src/runtime/scheduler/coordinator.ts` — Request/Resume, batch и очередь mounted effects.
7. `src/hydrate/hydration.ts` — принятие DOM; `src/server/render-to-string.ts` — сериализация.

## Правила изменения

- Не смешивайте реактивный граф, ownership tree и DOM tree.
- Передавайте document от места вставки; не создавайте узлы через глобальный document.
- Код диапазонов не импортирует mount или runtime; runtime не знает о JSX и корнях.
- Новый binding должен иметь определённого владельца и cleanup.
- Отмена задачи должна действовать и во время drain.
- Не называйте microtask браузерным кадром, paint barrier или приоритетом.
- Проверяйте поведение на ошибке, повторном входе и удалении владельца.

Для изменений lifecycle начните с `test/renderer.contract.test.tsx` и ownership
differential suites. Для reconciliation — seeded differential и operation-count
tests. Общие контракты проверяются также в Chromium через `test:browser`.
