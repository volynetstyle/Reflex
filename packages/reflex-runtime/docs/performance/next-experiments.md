# Следующие эксперименты Reflex

Это очередь независимых проверок, а не список изменений, которые нужно сразу
слить в runtime. Для perf-вариантов сначала фиксируются baseline и профиль
конкретного участка, затем один механизм меняется в изолированном варианте.
Сравнение включает одинаковую семантическую работу, распределение времени
(mean, p95, p99), аллокации и повторные запуски в новых процессах.

## 1. Nested validated dependency write

**Вопрос.** Не теряет ли watcher повторный запуск, если вложенное вычисление при
`pull_frontier()` записывает в уже проверенную зависимость того же watcher?

**Проверка.** Построить watcher с ранней и поздней committed dependency. Во время
валидации поздней зависимости вложенная callback пишет в раннюю. Переставить
зависимости, проверить `Changed`, `Unknown`, `Visited`, состояние scheduler claim,
число запусков и конечное значение. Повторить с исключением после записи и с
несколькими вложенными записями. Сравнить публичное поведение с независимой
моделью, а внутреннее состояние — с текущими topology contracts.

**Точка входа.** `test/runtime/topology/runtime.watcher-validation.test.ts`,
`src/kernel/stages/second/pull_frontier.ts`. Существующий тест уже покрывает
запись в committed edge во время валидации; новый сценарий должен проверить
именно _ранее валидированное_ ребро и наблюдаемый повторный запуск.

**Решение.** Если запуск теряется, сначала сохранить воспроизводящий тест, затем
исправить протокол reentrant invalidation. Если тест проходит, зафиксировать
инвариант и не менять hot path.

## 2. Generation as universal validation witness

**Вопрос.** Может ли generation доказать актуальность dependency и заменить часть
проверок при reconciliation без изменения порядка или семантики retry?

**Проверка.** Сначала перечислить, какую именно истину доказывает каждый stamp.
`edge.version` сейчас является stamp tracking pass, а не ревизией значения
producer. Отдельно исследовать доказательство актуальности value и membership;
прогнать static, branch switch, reorder, duplicate read, nested tracking,
exception/retry и wraparound epoch. Считать число обходов, branches и bytes/node.

**Точка входа.** `src/kernel/shape/tracking/`,
`src/kernel/shape/graph/reuseEdge.ts`, `src/kernel/state.ts`.

**Решение.** Принимать расширение только при доказанном инварианте для всех
перечисленных переходов и выигрыше на изолированном workload. Общий stamp,
который смешивает membership и value freshness, не считать доказательством.

## 3. Node hot/cold split

**Вопрос.** Какие поля `ReactiveNode` реально нужны producer, consumer и watcher
на горячем пути, и уменьшит ли разнесение память и стоимость создания без
нестабильных property access sites?

**Проверка.** Снять baseline bytes/node (с удержанием графа и после GC), создание,
write, pull, watcher run и p99. Профилировать IC/deopt отдельно для одинаковых и
смешанных ролей. Сравнить текущую полную форму с одним узким альтернативным
layout, сохраняя одинаковый порядок инициализации полей внутри каждой формы.

**Точка входа.** `src/kernel/shape/node.ts` и `test/dev/runtime/runtime.memory.dev.test.ts`.

**Решение.** Оставлять split, только если выигрыш в памяти/создании подтверждён
и mixed-role accesses не портят update и propagation. Не смешивать этот опыт с
изменениями state machine.

## 4. Notify epoch / repeated staged writes

**Вопрос.** Сколько повторной работы делает push при нескольких изменённых
записях внутри одного batch, когда получатели уже invalidated?

**Проверка.** Матрица: один producer с повторными записями, независимые producers
с общими descendants, direct watcher fan-out, разные ширины и глубины. Считать
visits по direct/transitive edges, вызовы host hook, scheduler claims и итоговое
число watcher runs. Для сравнения использовать тот же порядок и количество
записей, включая interleaved reads и reentrant writes.

**Точка входа.** `src/kernel/stages/first/push_iterator.ts`,
`src/kernel/batch.ts`, существующие perf fixtures topology.

**Решение.** Epoch допускается лишь если сокращает доказанную повторную работу,
не скрывает новую запись после read и не меняет immediate invalidation contract.

## 5. `settleFast()`

**Вопрос.** Какую долю стоимости простого batch создают общие runtime и host
settlement checks?

**Проверка.** Изолировать empty batch, equal write + batch/flush, changed write
без subscribers и один watcher. Измерить отдельно runtime boundary, scheduler
queue и DOM coordinator; сравнить paired trials с равными work counters. Уже
зафиксированный ориентир — около 4 ns для same-write boundary gap, но он
сам по себе не доказывает, что отдельная fast path окупится.

**Точка входа.** `src/kernel/batch.ts`,
`packages/reflex-dom/bench/scheduler-boundary.bench.ts`,
`bench-results/reflex-competitors/PRIORITY_FINDINGS.md` (пути от корня репозитория).

**Решение.** Оставлять специализацию только при стабильном абсолютном выигрыше
выше шума без регрессии p99 и без обхода host-visible settlement semantics.

## 6. `RULES.md` и generated citation checker

Это отдельная correctness-задача. Создать короткий индекс действующих правил:
rule ID, формулировка, исходный код, тест и подробный документ. Генератор
проверяет, что указанные file paths, anchors и test names существуют; CI
запускает checker. Текст правила остаётся предметом review: checker подтверждает
ссылки, а не семантическую истинность правила.

Начать с правил про reentrant validation, committed frontier, tracking stamp,
partial reconciliation on throw, scheduler ownership и runtime/host boundary.
Опорные документы: `docs/INVARIANTS.md`, `docs/RUNTIME.md`,
`docs/architecture-contract.md` и topology/differential tests.

## Порядок

1. Correctness-сценарий из пункта 1.
2. `RULES.md` и checker: они закрепят инварианты до оптимизаций.
3. Измерительные пробы пунктов 4 и 5; менять код лишь при повторённом выигрыше.
4. Пункты 3 и 2 после профиля памяти/IC и формального разбора stamp semantics.

Пункты 2–5 лучше держать отдельными вариантами: изменение node layout, stamp,
push epoch и settle path одновременно не позволит приписать результат одному
механизму.

## Проверенный baseline (2026-09-30)

| Направление            | Наблюдение                                                                                                                                                                                                                                                                                                                             | Статус решения                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Nested validated write | Отдельный output oracle прошёл для записи в раннее/позднее committed ребро, двух последовательных вложенных записей и исключения после записи.                                                                                                                                                                                         | Missed wake в этих сценариях не воспроизведён; тесты сохраняются как regression gate.                                                      |
| Generation             | Перестановки, повторные чтения, замена ветки и retry совпали с независимым SpecMachine. При изменённом значении producer `edge.version` остался прежним до нового tracking pass; переход `0xffffffff → 1` проверен.                                                                                                                    | Текущий tracking stamp не может быть универсальным свидетельством свежести значения. Альтернативная схема generation пока не испытывалась. |
| Node hot/cold split    | Mixed-role differential cases прошли на ширине 1, 2, 8 и 32; shape contract подтвердил стабильный набор полей каждой роли до и после исполнения. Existing callback-memory workload с 10 000 узлов дал 193 B/node для consumers и 192 B/node для watchers при `no-item-capture`; величина включает граф, callback и удержанные объекты. | Семантический baseline есть; стоимость отдельного layout и IC stability ещё не измерены, решение о split не принято.                       |
| Repeated staged writes | Projection на ширине 8 и 32: три изменённые записи посетили `3 × width` прямых рёбер, `width` транзитивных рёбер и дали `width` уведомлений watcher. Чтение между записями снова открыло транзитивную работу.                                                                                                                          | Повторная direct fan-out работа подтверждена; epoch-вариант должен сохранить случай с interleaved read.                                    |
| Settlement boundary    | Independent trace проверил пустой/equal batch, немедленный commit, одну host delivery и одно settlement. Однократный DOM benchmark текущей ветки: empty eager ~1.80 M ops/s, empty flush ~1.82 M ops/s, один eager watcher update ~0.44 M ops/s.                                                                                       | Это baseline без paired candidate; абсолютный выигрыш `settleFast()` не установлен.                                                        |
| Rules citations        | `pnpm check:rules` проверил 8 правил и 24 цитаты; запуск добавлен в CI.                                                                                                                                                                                                                                                                | Checker готов; смысл правила по-прежнему проверяется review.                                                                               |

Проверки: `pnpm test` (49 файлов, 298 passed, 1 skipped),
`pnpm test:projection` (6 файлов, 13 passed), `pnpm check:rules`,
`pnpm typecheck`, `pnpm test:dev` (7 файлов, 32 passed). `pnpm lint` пока
падает на 34 существующих ошибках в generated `perf/*/results/*.mjs` и
`test/differential/bounded-exhaustive.ts`; новые файлы проходят адресный ESLint.

Память: из `packages/reflex-runtime` — `pnpm build:perf`, затем
`node --expose-gc perf/callback-memory/run.mjs --count=10000 --trials=5 --variant=no-item-capture --json`.
DOM boundary: из `packages/reflex-dom` —
`pnpm exec vitest bench --config vite.config.ts bench/scheduler-boundary.bench.ts --run`.

## P0–P3: follow-up (2026-09-30)

### P0 — repeated direct fan-out

`writeProducer → pushIteratorCore`, direct phase, is the named traversal. The
projection baseline records `writes × width` direct edge visits while downstream
work is already coalesced to `width`. The new reopen matrix covers no
intervention, source/direct/transitive reads, new link, unlink, relink, watcher
execution, nested batch, and watcher failure. Pulling a direct or transitive
consumer, relinking a dependency, or executing a watcher can make a second
walk necessary. An especially small counterexample to a source-only marker is
`write → watcher callback throws before read → write`: recovery clears the
watcher's dirty state but retains its old edge, without a read on that source.

A safe skip witness would have to mean **every currently linked direct
subscriber is still invalidated by this source's last walk**. It must be
invalidated on new linking and on any retained subscriber becoming clean,
including error recovery. Current source/batch state does not encode that
predicate. Maintaining it through every clean/relink path would add graph
visits or mutations to common read paths. No hot-path patch is accepted on the
present evidence. A future candidate needs an isolated implementation, a
profile showing the direct phase dominates a real wide-write workload, and
paired mean/p95/p99 measurements against the reopen matrix.

### P1 — nested validation proof

`RULES.md` R2 now states the mechanism and its scope. The watcher validation
frontier is marked `Computing`; a nested write through a committed edge sets
`Visited | Unknown` even if the watcher was already `Unknown`. The marker
survives frontier restoration, so a later watcher run executes. The independent
output oracle covers early/late edge order, repeated writes, throw/retry, and
generated write/failure combinations. This proof is scoped to the committed
watcher frontier, rather than arbitrary uncommitted edges or host callbacks.

### P2 — retained allocation

`perf/node-allocation/README.md` gives the reproducible fixture and medians.
With shared callbacks, producers, consumers, and watchers each retain about
97 B/node. A distinct captured closure adds about 96 B/node; attached edges
add about 80–82 B/edge. Shared cleanup and the scheduled state bit add no
resolved allocation. Owner metadata is outside this low-level runtime fixture.
The evidence does not justify a node hot/cold split.

### P3 — differential state space

The differential operation language now has explicit nested batch boundaries.
A seeded fast-check suite executes 1000 generated traces of writes, pulls,
branch changes, watcher failure, flush, nested batches, and watcher
dispose/recreate against `SpecMachine`. It also runs causal prefixes for
`write → pull → write`, `write → link → write`, `write → unlink → write`, and
failure/recreation. A second generated suite uses an independent output oracle
for nested writes during validation, with an optional throw after the write.
The spec observes explicit reads and flushes; batch entries/exits themselves
have no value event in that oracle.
