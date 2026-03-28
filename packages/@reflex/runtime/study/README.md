# `@reflex/runtime` Study

Ця папка пояснює поточний low-level runtime з пакета `@reflex/runtime`.

Важливе уточнення: це не "зручний app-level createRuntime API".
Це компактне ядро, яке працює з `ReactiveNode`, `ReactiveEdge`,
`readProducer`, `readConsumer`, `writeProducer`, `runWatcher` і runtime hooks.

Мета цих матеріалів:

- дати зрозумілу mental model для поточного коду
- пояснити, як працюють `write`, `read`, watchers і dynamic deps
- показати, де проходять hot path-и
- дати карту файлів для безпечного рефакторингу

## Для кого це

- Для людини, яка читає `src/` і хоче швидко зібрати картину.
- Для автора runtime-змін, якому важливо не зламати walkers і tracking.
- Для того, хто хоче зрозуміти, чому цей пакет оптимізований під hot path, а не під красиві абстракції.

## Як читати

Рекомендований порядок:

1. [01-basics.md](./01-basics.md) - producer, consumer, watcher і чому ядро поєднує cheap push invalidation з lazy pull stabilization.
2. [02-public-api.md](./02-public-api.md) - що саме експортує пакет і як цими примітивами користуватися.
3. [03-core-model.md](./03-core-model.md) - `ReactiveNode`, `ReactiveEdge`, state bits, `depsTail`, runtime context.
4. [04-read-and-write-paths.md](./04-read-and-write-paths.md) - `writeProducer`, `readConsumer`, `shouldRecompute`, `recompute`, `propagate`.
5. [05-dynamic-dependencies.md](./05-dynamic-dependencies.md) - `trackRead`, reorder, stale-suffix cleanup і branch switching.
6. [06-effects-and-scheduler.md](./06-effects-and-scheduler.md) - watcher protocol і host hooks замість вбудованого scheduler.
7. [07-invariants-dev-and-prod.md](./07-invariants-dev-and-prod.md) - що не можна ламати в current design.
8. [08-performance.md](./08-performance.md) - cost model і hot path-и поточного runtime.
9. [09-extension-guide.md](./09-extension-guide.md) - де проходять безпечні seams для змін.
10. [10-source-map.md](./10-source-map.md) - актуальна карта файлів і порядок читання коду.

## Ключова ідея

У поточному runtime основний цикл виглядає так:

1. `writeProducer()` комітить значення producer-вузла.
2. `propagate()` дешево штовхає dirty/changed стан по `firstOut`.
3. `readConsumer()` лише на demand вирішує, чи треба реальний recompute.
4. `executeNodeComputation()` запускає compute, перебудовує dependency prefix і чистить stale suffix.
5. Watcher execution не вшитий жорстко в ядро: host отримує invalidation через hooks і сам вирішує, коли викликати `runWatcher()`.

## Що тут більше не описується

Старі матеріали в цій папці спиралися на попередню модель з `epoch`, `t/v/s/w`,
`ensureFresh()` і монолітними `src/walkers.ts` / `src/tracking.ts`.

Поточний runtime інший:

- роль вузла задається state bits, а не `kind`
- dirty protocol тримається на `Invalid` / `Changed`, а не на `Obsolete`
- pull-side refresh проходить через `shouldRecompute()` + `recompute()`
- dynamic deps підтримуються через `depsTail` і reorder списку ребер, а не через tracking epoch

Тому далі в `study` усе описано вже в термінах поточного коду.
