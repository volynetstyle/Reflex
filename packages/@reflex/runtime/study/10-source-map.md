# Карта вихідних файлів

Цей розділ потрібен для дуже практичної речі:
щоб нова людина не відкривала `src/` навмання.

Нижче - рекомендований порядок читання і коротка роль кожного файла.

## Рекомендований порядок читання

Якщо ви вивчаєте beta вперше, ідіть так:

1. `src/api.ts`
2. `src/core.ts`
3. `src/engine.ts`
4. `src/walkers.ts`
5. `src/tracking.ts`
6. `src/graph.ts`
7. `src/engine/execute.ts`
8. `src/engine/compute.ts`
9. `src/engine/effect.ts`
10. `src/effect_scheduler.ts`
11. `test/signal_beta.test.ts`
12. `test/signal_beta.bench.ts`

Чому саме так:

- спочатку бачите зовнішній контракт
- потім модель даних
- потім write/read pipeline
- потім деталі tracking і execution
- і лише після цього тести та perf-профіль

## `src/api.ts`

Це публічна поверхня runtime.

Тут ви побачите:

- `createRuntime`
- `signal`
- `computed`
- `memo`
- `effect`
- `flush`
- `batchWrite`

Що важливо зрозуміти в цьому файлі:

- яким API користується зовнішній код
- як runtime збирається з внутрішніх частин
- де підключається effect scheduler
- як signal/computed/effect перетворюються на реальні `ReactiveNode`

Якщо вам треба швидко зрозуміти "як цим узагалі користуватися",
починайте звідси.

## `src/core.ts`

Це серце моделі.

Тут знаходяться:

- `ReactiveNode`
- `ReactiveEdge`
- `ReactiveNodeState`
- `ReactiveNodeKind`
- helpers для state-bitset
- `EngineContext`
- node factories

Що важливо зрозуміти:

- сенс `t`, `v`, `s`, `w`
- чому `Dirty` - це маска, а не окремий біт
- чим відрізняються `Signal`, `Computed`, `Effect`
- які структури даних існують у графа

Якщо ви не зрозуміли `core.ts`, далі все здаватиметься магією.

## `src/engine.ts`

Це write-path.

Головні функції:

- `writeSignal`
- `batchWrite`

Що важливо зрозуміти:

- запис не перераховує граф
- no-op write відсікається через `Object.is`
- оновлюється `t`
- downstream лише invalidation-иться

Цей файл добре показує філософію beta:

"роботу краще відкласти до читання, ніж робити її під час запису"

## `src/walkers.ts`

Це read/refresh path і один із найважливіших файлів у всьому runtime.

Тут знаходяться:

- `markInvalid`
- `needsUpdate`
- `ensureFresh`

Що важливо зрозуміти:

- як `Invalid` проштовхується вниз
- як доводиться `Obsolete`
- як runtime досягає локально правильного topo-order
- як забезпечується single-pass recompute

Якщо ви хочете зрозуміти, як beta реально оновлює граф, це ваш головний файл.

## `src/tracking.ts`

Це dependency tracking шар.

Тут знаходяться:

- `trackRead`
- `cleanupStaleSources`

Що важливо зрозуміти:

- як читання source/computed додає ребро в граф
- як перевикористовуються старі залежності
- як видаляються stale dependencies після branch switching
- навіщо потрібен tracking epoch `node.s`

Цей файл особливо важливий для розуміння dynamic deps.

## `src/graph.ts`

Це низькорівнева механіка ребер.

Тут знаходяться:

- `linkEdge`
- `unlinkEdge`
- `unlinkFromSource`
- `unlinkAllSources`

Що важливо зрозуміти:

- граф зберігається як двозв'язок списків `firstOut/firstIn` на одному edge-об'єкті
- cleanup stale deps - не магія, а звичайна операція unlink
- disposal effect теж працює через видалення inbound-джерел

Це інфраструктурний файл.
Зазвичай його читають після розуміння `tracking.ts`.

## `src/engine/execute.ts`

Це спільний pipeline виконання для вузлів із compute-функцією.

Що тут відбувається:

- перемикання `activeComputed`
- встановлення `Computing`
- виклик користувацької compute-функції
- cleanup stale sources
- зняття `Computing`

Чому файл важливий:

- він показує, що `computed` і `effect` ділять ту саму базову механіку
- він є хорошим seam для розширення без дублювання протоколу

## `src/engine/compute.ts`

Це commit-логіка для `computed`.

Що важливо зрозуміти:

- `payload` оновлюється новим значенням
- `v` ставиться в поточний epoch
- dirty-state очищається
- `t` оновлюється лише при реальній зміні результату

Якщо ви намагаєтеся відлагодити "чому memo поводиться дивно",
цей файл обов'язковий до читання.

## `src/engine/effect.ts`

Це commit-логіка і lifecycle для `effect`.

Тут знаходяться:

- `runEffect`
- `disposeEffect`

Що важливо зрозуміти:

- effect зберігає cleanup у `payload`
- старий cleanup викликається перед новим прогоном
- dispose від'єднує effect від його поточних джерел
- effect відрізняється від computed саме своєю owner/cleanup семантикою

## `src/effect_scheduler.ts`

Це окремий policy-layer для запуску effects.

Тут ви побачите:

- чергу ефектів
- dedupe через `Scheduled`
- стратегії `flush` і `eager`

Чому цей файл важливий архітектурно:

- scheduler винесений із lazy-core
- різні flush-режими можна розвивати окремо
- semantics graph-refresh не змішується з execution policy effects

Якщо ви хочете додати новий режим запуску effects, ідіть сюди насамперед.

## `test/signal_beta.test.ts`

Це основний файл коректності.

Його завдання - довести, що runtime:

- правильно працює на базових сигналах
- не робить зайвих recompute
- коректно переживає diamond/shared subtree
- уміє branch switching
- захищений від циклів або хоча б детектить їх

Якщо код здається зрозумілим, а поведінка все ще неясна,
тести часто пояснюють краще за коментарі.

## `test/signal_beta.bench.ts`

Це не "доведення істини", а карта perf-профілю.

Він показує, як beta поводиться в сценаріях:

- wide static graph
- deep chain
- diamond/fan-in
- dynamic deps
- batch update
- realistic UI workload

Його корисно читати не заради цифр, а заради питань:

- де lazy design економить роботу
- де eager runtime може бути вигіднішим

## Як читати код без болю

Є зручна стратегія.

### Перший прохід

Дивіться лише на ролі файлів і функції верхнього рівня.
Не намагайтеся одразу зрозуміти кожен біт.

### Другий прохід

Простежте один конкретний сценарій:

1. створити `signal`
2. створити `computed`
3. прочитати `computed`
4. зробити `write`
5. знову прочитати `computed`

### Третій прохід

Візьміть dynamic deps:

```ts
computed(() => cond() ? a() : b())
```

І руками простежте:

- де додалося нове ребро
- де старе ребро стало stale
- де воно видалилося

Після цього архітектура зазвичай "клацає" в голові.

## Якщо ви прийшли змінювати runtime

Корисний маршрут читання буде таким:

1. `src/core.ts`
2. `src/walkers.ts`
3. `src/tracking.ts`
4. `src/engine/execute.ts`
5. потім уже конкретний шар, який хочете змінювати

Причина проста:

саме ці файли задають основні інваріанти.

## Короткий висновок

`@reflex/beta` маленький, але не примітивний.
Його легше зрозуміти, якщо читати не "по папці", а за шарами відповідальності:

- API
- core model
- write path
- refresh path
- tracking
- execution
- scheduler
- tests
- benchmarks

Такий порядок різко зменшує відчуття, що всередині якась реактивна магія.
Насправді там доволі компактна й інженерно зрозуміла система.
