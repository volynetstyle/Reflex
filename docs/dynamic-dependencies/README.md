# Динамические зависимости в Reflex

Это единая техническая точка входа для динамических зависимостей публичного
пакета `@volynets/reflex` и графового ядра `@volynets/reflex-runtime`.
Документ описывает семантику, структуру графа, маршруты resolver-а, классы
динамических топологий, счётчики и воспроизводимые бенчмарки.

## Коротко

Динамическая зависимость возникает, когда набор или порядок источников
вычисления меняется между запусками:

```ts
const selected = computed(() => (flag() ? left() : right()));
```

После переключения `flag` ребро к старой ветке должно исчезнуть, а ребро к
новой — появиться. Иначе старая ветка становится phantom dependency и продолжает
напрасно инвалидировать `selected`.

Публичный `computed`/`memo` из `@volynets/reflex` даёт пользовательскую
семантику. Низкоуровневый `createConsumer` и read tracking из
`@volynets/reflex-runtime` поддерживают реальную форму графа. Оба уровня
используют один runtime-механизм.

## Контракт

- Read текущего producer-а во время compute создаёт или переиспользует ровно
  одно входящее ребро consumer-а.
- Порядок входящих рёбер следует порядку чтений текущего compute.
- Сохранённая зависимость переиспользует существующее ребро, если resolver может
  найти его в ограниченном бюджете.
- Новая зависимость вставляется сразу после tracking cursor.
- Не подтверждённый текущим compute хвост удаляется одной cleanup-фазой.
- Запись в удалённый источник больше не инвалидирует consumer; запись в новый
  источник инвалидирует его.
- `untracked()` отключает регистрацию, но не само чтение значения.

Value logic (`Invalid`, `Changed`, compare/recompute) отвечает на вопрос
«изменилось ли значение?». Shape logic (`tailIn`, resolver, cleanup) отвечает на
вопрос «какие зависимости сейчас истинны?». Эти контракты связаны, но не
взаимозаменяемы.

## Представление графа и жизненный цикл compute

У consumer-а входящие dependency edges образуют двусвязный список. Во время
сбора зависимостей `consumer.tailIn` — временной cursor последнего уже
подтверждённого чтения:

```text
firstIn -> [подтверждённый prefix ... tailIn] [старый suffix ... lastIn]
```

Один compute проходит четыре фазы:

1. runtime назначает active consumer и начинает сбор;
2. каждое tracked-чтение проходит через `resolveTrackedRead`;
3. resolver двигает cursor и при необходимости переставляет/создаёт ребро;
4. `cleanupStaleSources` отцепляет всё после cursor.

Cleanup выполняется один раз после compute, а не после каждого чтения. На
статической форме это ранний return: если после `tailIn` нет ребра, удалять
нечего.

Во время `Computing` старый suffix ещё физически существует. Для корректной
re-entrant invalidation валидным считается только уже подтверждённый prefix;
это проверяет `isTrackedPrefixEdge`. Если подтверждённая зависимость меняется
прямо во время compute, `Visited | Invalid` заставляет consumer повторить
вычисление.

## Иерархия маршрутов read tracking

Resolver устроен как маленькая cache hierarchy. Он сначала использует
локальность уже существующего графа и только затем запускает ограниченное
согласование suffix-а.

| Уровень             | Счётчик                                                  | Условие и действие                                                        |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| L0 cursor           | `trackingCursorHit`                                      | `tailIn.from === producer`; повтор текущей позиции                        |
| L1 sequential       | `trackingNextHit`                                        | `tailIn.nextIn.from === producer`; обычный стабильный порядок             |
| L2 append           | `trackingAppendAfterCursor`                              | cursor уже на конце; создать новое ребро без scan                         |
| L3 adjacent reorder | `trackingOneHopReorder`, `trackingTwoHopReorder`         | producer на одну/две позиции дальше; переставить ребро после cursor       |
| L4 tail             | `trackingLastEdgeShortcut`                               | producer — `lastIn`; перенести известный tail без scan                    |
| L5 prefix guard     | `trackingPrefixDuplicate`                                | producer уже прочитан в подтверждённом prefix; не создать дубль           |
| L6 producer probe   | `trackingOutgoingProbeHit1`, `trackingOutgoingProbeMiss` | прямой `producer.firstOut` указывает на consumer                          |
| L7 reconciliation   | `trackingSlowPath`                                       | bounded scan suffix-а; переиспользовать найденное или создать новое ребро |

Отдельные bootstrap-маршруты — `trackingInitialCreate`,
`trackingInitialFirstHit` и `trackingInitialLastEdgeShortcut`.
`trackingSlowPathBlocked` означает, что slow path запрещён текущим режимом.

L6 намеренно является только прямой пробой, а не scan исходящих рёбер. L7 имеет
ограниченный бюджет (в текущем churn harness максимум 32 ребра), поэтому
патологический reorder не превращает каждое чтение в неограниченный поиск.
После miss корректность сохраняется созданием нового ребра и удалением старого
suffix-а в cleanup.

## Классы динамических топологий

Класс определяется не названием приложения, а тем, как между compute меняются
membership и порядок dependency trace.

| Класс             | Изменение trace                               | Ожидаемые маршруты                          | Существующий сценарий                                   |
| ----------------- | --------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Static            | membership и порядок неизменны                | L0/L1, cleanup skip                         | `static_1024`                                           |
| Local reorder     | малый swap/displacement                       | L3                                          | `swap_small_1024`, `rotate-left`, `displacement-two`    |
| Tail rotation     | край списка переносится в начало/середину     | L4, иногда L6/L7                            | `rotate_1024`, `rotate-right`                           |
| Branch switch     | одна ветка полностью заменяет другую          | L2/L7 + массовый cleanup                    | `branch_half_1024`, `branch_swap_1024`, `dynamicBranch` |
| Partial retention | стабильный prefix, хаотичный/сменный suffix   | L1 + L3–L7                                  | `prefix_suffix_chaotic_1024`                            |
| Shrink/drop       | trace становится короче                       | L1 + cleanup suffix                         | `stable_then_drop_1024`                                 |
| Mixed churn       | reorder и membership churn одновременно       | все уровни                                  | `mixed_churn_1024`, `mixed-app-churn`                   |
| Oscillating       | соседние проходы принадлежат разным классам   | меняющееся сочетание L3/L4/L7               | `oscillate_rotate_*`                                    |
| Deep dynamic      | branch switching размножен по глубине графа   | tracking + pull/push traversal              | `deepDynamic`                                           |
| Sparse selector   | из большого множества активна одна dependency | короткий branch switch, высокая selectivity | `selector/update-one-key`                               |

Практически важны четыре независимые оси: fan-in, retained ratio, reorder
distance и глубина. Поэтому одного «dynamic benchmark» недостаточно: branch
switch с нулевым retention, локальный swap и глубокий динамический граф нагружают
разные участки runtime.

### Главная граница классов: reorder и membership

Общее слово «динамика» скрывает два принципиально разных вида работы:

```text
non-local reorder = нужное ребро существует, но далеко в suffix
membership churn  = старое ребро больше не нужно, а новое надо создать
```

Для текущего resolver-а наиболее тяжёлый класс — не произвольный хаос сам по
себе, а устойчивый дальний reorder уже существующих зависимостей. Поэтому
`prefix_suffix_chaotic` и `oscillate_rotate_swap` могут быть опаснее сценария с
огромной сменой set-а.

Read locality и edge-reuse locality при этом не одно и то же. Экспериментальный
`nonlocal_absurd` намеренно разрушал соседство reads (17 source banks, дальние
переходы, смена порядка и set-а), но дал около `99.8% append`: старые edges при
сильном membership churn часто не надо искать и переставлять — новые
зависимости просто добавляются. Потеря локальности чтений, таким образом, ещё не
доказывает дорогой поиск существующих рёбер.

`chaotic_dynamic` и `absurd_churn` также сохранили почти прежний prefix profile
(около `81k / 15.5%` и `56k / 10.7%`). Это отдельная нагрузка repeated
membership/duplicate reads; оптимизация дальнего suffix reorder не обязана её
исправлять.

### Consumer-first — граница корректности

Две стороны intrusive graph сообщают разную информацию:

```text
producer.out -> identity: существует ли edge producer -> consumer
consumer.in  -> position: edge уже в подтверждённом prefix или ещё в suffix
```

Producer-side identity недостаточно для безопасного перемещения ребра. В
эксперименте порядок `next -> out1 -> hop/tail/fallback` ускорял бенчмарки, но
сломал topology tests: ранняя producer probe могла вернуть edge из уже
пройденного prefix и переместить duplicate read.

Поэтому действующий порядок следует понимать так:

```text
consumer-side cursor/prefix reasoning
-> подтверждение prefix safety
-> producer-side probe внутри suffix reconciliation
```

Это делит иерархию на две роли:

- structural correctness: cursor, expected next и prefix position;
- performance acceleration: hop, tail, безопасная producer probe и bounded
  reconciliation.

Схлопывать эти уровни в универсальный producer lookup нельзя без отдельного
доказательства prefix safety.

### Эксперимент с positional producer metadata

Отдельная исследовательская ветка добавляла:

```ts
node.trackingOrderEpoch;
node.currentOrder;
edge.lastSeenEpoch;
edge.lastSeenOrder;
```

Так producer-side lookup получал не только identity, но и наблюдавшуюся позицию.
В одном прогоне это адресно изменило reorder-heavy маршруты:

| Сценарий                |           Latency |  Suffix route |
| ----------------------- | ----------------: | ------------: |
| `oscillate_rotate_swap` |  21.72 -> 8.03 ms |  ~260k -> 505 |
| `prefix_suffix_chaotic` | 18.99 -> 17.78 ms | ~206k -> 146k |

Route migration — сильный механистический сигнал: эксперимент убрал именно тот
путь, для которого вводилась metadata. Но это один прогон, а полей
`trackingOrderEpoch/currentOrder/lastSeen*` в текущем runtime нет. Результат
нельзя выдавать за текущий baseline или финальную статистику; перед принятием
нужны повторные замеры mean/tails, memory cost и проверка стабильности object
shape.

Membership churn этот механизм не исправил. Это подтверждает итоговую модель:
identity + position нужны для reconciliation существующего suffix edge, а
создание/удаление membership остаётся отдельной задачей.

### Отрицательные результаты и shape trade-off

- Ранняя проверка `edge.version === producerVersion` прошла correctness tests,
  но почти не изменила routes. Её hot-path cost не оправдан этим профилем.
- Для двустороннего intrusive edge практически необходимы `from`, `to`,
  `prevIn`, `nextIn`, `prevOut`, `nextOut`, `version`. Positional lookup добавляет
  seen epoch/order, то есть имеет явную цену памяти и shape.
- Специализация producer/consumer/tracking/value shapes может уменьшить объекты,
  но её надо сравнивать с текущим monomorphic fat shape: экономия памяти может
  превратиться в polymorphic IC и потерю скорости.

## Счётчики

Профильная сборка экспортирует `profileRuntime(fn)`, который возвращает результат
и runtime counters. Для динамических зависимостей полезны четыре группы:

- resolver: `trackingResolveCalls` и все `tracking*` routes из таблицы выше;
- cleanup: `cleanupCalls`, `cleanupSkipped`, `cleanupEdgesDropped`;
- вычисление: `advanceCalls`, `advanceComputeRuns`, `advanceChanged`,
  `advanceUnchanged`, `advanceCleanupRuns`;
- traversal: `push*` и `pull*`, когда shape change распространяется по графу.

Интерпретация:

- доля route = `route / trackingResolveCalls`;
- slow-path rate сам по себе недостаточен — нужны avg/p95/p99/max scan length и
  found/miss;
- `cleanupEdgesDropped` измеряет membership churn, но не reorder сохранённых
  зависимостей;
- для deep topology tracking counters нужно читать вместе с `pullEdgesVisited`,
  `push*EdgesVisited` и числом compute runs.

Обычная production-сборка компилирует профильные инкременты через
`__PROFILE__ = false`. Нулевые route counters в ней не означают отсутствие
чтений; для счётчиков нужна специальная profile-конфигурация.

## Как запускать

Из корня репозитория:

```powershell
# Публичный facade + runtime: 12 dependency traces, latency и scan histogram
pnpm.cmd --filter @volynets/reflex exec vitest bench bench/dependency-churn.bench.ts --run

# Какими routes реально обслуживаются специальные trace-классы
pnpm.cmd bench:tracking-tier-profile

# 2^3 ablation: one-hop, two-hop и last-edge on/off
pnpm.cmd bench:tracking-factorial

# Runtime taxonomy: широкий branch switch и sparse selector
pnpm.cmd --filter @volynets/reflex-runtime exec vitest bench test/perf/runtime-taxonomy.bench.ts --run -t dynamic-branch
pnpm.cmd --filter @volynets/reflex-runtime exec vitest bench test/perf/runtime-taxonomy.bench.ts --run -t selector
```

Factorial harness перезаписывает временные tracking-флаги и обязан восстановить
`resolve.ts`. После прогона полезно проверить `git diff` и не принимать
оставшуюся подстановку за изменение runtime.

## Контрольный прогон 2026-07-14

Среда: Windows, Node/Vitest workspace, Intel Core i5-1235U. Это локальная точка
отсчёта, а не переносимая гарантия производительности.

### Facade dependency churn

`DEPS=1024`, `STEPS=512`. В таблице latency — среднее время одного benchmark
iteration; p99 нужно читать осторожно для сценариев с малым числом samples.

| Класс/сценарий                           | mean, ms | p99, ms | ops/s |
| ---------------------------------------- | -------: | ------: | ----: |
| Static                                   |    0.514 |  20.382 | 1,944 |
| Local reorder: Swap Small                |    5.747 |  11.215 |   174 |
| Tail rotation: Rotate                    |    7.535 |  41.632 |   133 |
| Full reorder: Alt A/B                    |    5.910 |   7.898 |   169 |
| Partial retention: Prefix/Suffix Chaotic |   16.121 |  20.424 |  62.0 |
| Branch Half                              |    9.483 |  27.428 |   105 |
| Shrink: Stable Then Drop                 |    4.826 |  34.155 |   207 |
| Oscillate Rotate/Branch                  |   27.827 |  73.066 |  35.9 |
| Oscillate Rotate/Swap                    |   18.639 |  20.152 |  53.6 |
| Branch Swap                              |   15.765 |  34.218 |  63.4 |
| Mixed Churn                              |   17.995 |  26.575 |  55.6 |

Scan counters подтверждают bounded cost: для тяжёлых классов p95/p99/max =
32 edges. `prefix_suffix_chaotic_1024` нашёл существующее ребро в 85.98% slow
scans; branch/mixed membership churn дал почти одни misses. У `mixed_1024`
средний scan — 14 edges, у тяжёлых branch/oscillating классов — около 31–32.

Route-колонки этого конкретного facade-прогона были нулевыми из-за production
import. Scan histogram валиден, а tier routes ниже получены отдельной профильной
сборкой.

### Route profile и factorial ablation

Каждый route-profile run сделал `33,024` resolve calls. Суммарные характерные
счётчики:

| Trace                          | Главный route               | Срабатывания | Slow path |
| ------------------------------ | --------------------------- | -----------: | --------: |
| rotate-left                    | one-hop                     |      650,240 |         0 |
| displacement-two               | two-hop                     |      645,120 |         0 |
| rotate-right, last-edge on     | last-edge                   |        5,120 |         0 |
| rotate-right, last-edge off    | outgoing probe              |        5,120 |     5,120 |
| conditional-branches           | one-hop + membership misses |  1,740 + 640 |       640 |
| mixed-app-churn, last-edge on  | last-edge                   |       37,120 |         0 |
| mixed-app-churn, last-edge off | outgoing probe              |       37,120 |    37,120 |

Marginal latency effect factorial-прогона (`disabled/enabled - 1`, положительное
значение означает пользу tier-а):

| Trace                | one-hop | two-hop | last-edge |
| -------------------- | ------: | ------: | --------: |
| rotate-left          | +84.97% |  +1.04% |    +0.48% |
| rotate-right         |  -0.19% |  -0.07% |    +0.02% |
| displacement-two     |  -1.11% | +61.57% |    +0.82% |
| conditional-branches |  +0.55% |  -0.88% |    +0.35% |
| mixed-app-churn      |  +0.72% |  -0.86% |    +5.14% |

Вывод ограничен этими trace-классами: one-hop и two-hop дают крупный выигрыш
только на совпадающем displacement; last-edge заметно помогает mixed-app churn,
где заменяет тысячи переходов в reconciliation. Малые отрицательные значения
на несовпадающих классах следует считать стоимостью guard-а/шумом и проверять
повторными прогонами, а не обобщать в архитектурный вывод.

### Runtime topology taxonomy

| Топология                 | modeled work                                                   |      mean |       p99 |  ops/s |
| ------------------------- | -------------------------------------------------------------- | --------: | --------: | -----: |
| `dynamicBranch`, deps 512 | 2 writes, 513 producer reads, 512 add + 512 drop               |  1.833 ms |  3.590 ms |    545 |
| `selector`, entities 4096 | 2 writes, 2 producer reads, 1 consumer read, 4 edge traversals | 0.0330 ms | 0.0774 ms | 30,322 |

Отдельный filtered-запуск `deepDynamic` зарегистрировал benchmark, но Vitest
4.1.5 не выдал samples/метрики. Число для него намеренно не выдумано; сценарий
остаётся в taxonomy и требует исправления/отдельного harness-а перед сравнением.

Полные машинные отчёты находятся в
`bench-results/tracking-tier-factorial/latest.json` и
`bench-results/tracking-tier-factorial/route-substitution.json`.

## Карта исходников

- Публичная семантика: `packages/reflex/src`, тест
  `packages/reflex/tests/reflex.dynamic.test.ts`.
- Facade churn и scan instrumentation:
  `packages/reflex/bench/dependency-churn.bench.ts`.
- Read entry point: `packages/reflex-runtime/src/kernel/shape/tracking/read.ts`.
- Cache hierarchy и reconciliation:
  `packages/reflex-runtime/src/kernel/shape/tracking/resolve.ts`.
- Prefix membership:
  `packages/reflex-runtime/src/kernel/shape/tracking/prefix.ts`.
- Stale suffix cleanup:
  `packages/reflex-runtime/src/kernel/shape/tracking/cleanup.ts`.
- Edge list invariants:
  `packages/reflex-runtime/src/kernel/shape/graph/edgeList.ts`.
- Resolver correctness:
  `packages/reflex-runtime/test/runtime/topology/runtime.tracking-resolver.test.ts`.
- Runtime topology taxonomy:
  `packages/reflex-runtime/test/perf/runtime-taxonomy.bench.ts`.
- Factorial/profile harnesses: root `scripts/compare-tracking-tiers-factorial.mjs`
  и `scripts/profile-tracking-tier-substitution.mjs`.

## Чек-лист изменений

После изменения tracking-пути проверяйте:

- branch switch удаляет старую и добавляет новую dependency;
- repeated reads не создают дубли;
- incoming/outgoing ссылки и `firstIn`/`lastIn` остаются согласованы;
- static trace остаётся на L0/L1 без полного scan;
- local reorder, tail rotation, membership churn и deep dynamic измерены
  раздельно;
- вместе со средним сохранены p75, p95/p99, variance/RME и route/scan counters;
- factorial harness восстановил исходный `resolve.ts`.
