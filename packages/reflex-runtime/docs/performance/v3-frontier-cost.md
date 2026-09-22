# V3: стоимость полного validation frontier

V3 — гарантия: до cleanup и запуска watcher callback runtime проверяет
**весь committed dependency frontier**. Это не вариант eager effect и не
общая стоимость scheduler: V3 находится в `pull_frontier()`.

Этот документ разделяет доказанные затраты, архитектурные следствия и
гипотезы. Он не превращает число профильных событий в «процент CPU»: для
такого вывода нужна отдельная калибровка стоимости каждого события.

## Модель цены

```text
write / push invalidation
          |
          v
watcher Unknown
          |
          v
pull_frontier (V3): полный root frontier
  clean root        -> один shallow state check
  Changed root      -> advance
  Unknown subtree   -> should_recompute / deep pull
          |
          v
только затем cleanup и watcher callback
```

Строгая граница V3 равна `O(D + dirty slice)`, где `D` — число committed
root dependencies watcher. Если dirty dependency требует deep validation,
к ней добавляется её pull traversal. Ранний confirmed change **не** разрешает
закончить обход: поздний dependency может выбросить ошибку, а lifecycle уже
необратим. Это проверяется контрактом V3 и independent spec-runtime.

Профильные счётчики `watcherFrontierEdgesVisited`,
`watcherFrontier{Changed,Invalid,Clean}Deps` изолируют именно этот участок.
Тест `watcher-frontier.projection.test.ts` фиксирует ключевой инвариант:
при изменённом первом root из 128 обход всё равно посещает 128 root edges
(1 changed, 127 clean).

## Что дала semantic decomposition

| Компонент            | Наблюдение                                                                                                                                                                               | Вывод                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| V3 root frontier     | Для clean root `pull_frontier` выполняет fused shallow loop, не входит в generic deep walker и не делает call на каждый clean edge.                                                      | Семантическая гарантия изолирована: плата за неё — предсказуемый линейный scan, а не branch в push hot path.            |
| Clean path           | В external comparative probe clean-edge был почти паритетным с Alien (разрыв около 6.5%).                                                                                                | Decomposition не добавила заметного common-path налога. Это внешний сигнал, а не доказательство cost share.             |
| Стабильный tracking  | В sweep `locality` при width=128 все режимы лежат в 421–432 µs/op; dominant bucket — `trackingFast`, reconciliation не появляется.                                                       | Cursor/next fast path держит стабильный dependency set локальным даже при permutation и duplicate reads.                |
| Equality shielding   | В `semantic` при росте semantic-change ratio 0 -> 1 generic `pull` уменьшается с 255 до 1 events/op: подтверждённые изменения не заставляют повторно deep-validate уже известный result. | Разделение Changed/Unknown срезает pull work там, где есть подтверждённое evidence. Однако это переносит работу в push. |
| Reentrancy ownership | V3 использует `Computing + tailIn` и существующий push protocol для epoch-local invalidation.                                                                                            | Гарантия reentrancy не размазывает дополнительный state/branch по обычной propagation path.                             |

## Где цена остаётся и нужна specialization

| Приоритет | Компонент                          | Данные из `bench-results/cost-attribution/REPORT.md`                                                                                                                                                                        | Следующий узкий шаг                                                                                                                                                                                         |
| --------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0        | Высокий fan-out / push             | До specialization: `6143 = 2048 direct + 2048 transitive + 2047 push-once`. После передачи stable committed edge как owned continuation: `4096 = 2048 direct + 2048 transitive`, `push-once=0`, `owned-edge elisions=2048`. | Structural duplication устранена. Новый timing leg даёт 9.83 ms/op на fanout=2048, но старые 26.39 ms/op не являются paired A/B; точный throughput uplift ещё требует чередующегося baseline/candidate run. |
| P1        | `advance()` / equal-result path    | Recompute без downstream propagation отделяет enter/compute/restore/cleanup-check/compare/state-commit от fan-out.                                                                                                          | Добавить paired changed-vs-equal probe с одинаковой topology и counters `advance*`, tracking, cleanup. Только затем сжимать этот path.                                                                      |
| P2        | Большой fan-in / dependency width  | fanin=2048: trackingFast 2,048 events/op, 6.89 ms/op; width=2048: 2,048, 7.17 ms/op.                                                                                                                                        | Специализировать stable wide read-set: data layout/edge iteration и bulk cursor reuse. Здесь нет доказательства algorithmic duplication — это mechanical задача.                                            |
| P3        | Широкий watcher frontier (цена V3) | Семантически неизбежен `O(D)` root scan. Предыдущий `pull-wide` timing probe даёт противоречивый head-change результат, поэтому его нельзя использовать как доказательство ускорения.                                       | Собирать timing вместе с новыми V3 counters и проверять `frontierEdgesVisited == D` для clean/head/tail/equality. Сравнивать только одинаковый обход.                                                       |
| P4        | Глубокий dirty path                | depth=512: advance 1,024 events/op, pull 1,021, 4.82 ms/op.                                                                                                                                                                 | Расследовать примерно `2D`, но после high-fan-out: глубина сейчас не является самым плохим customer-shaped path.                                                                                            |
| P5        | Dynamic dependency maintenance     | `churn` при width=128: trackingFast ~128, reconcile растёт 0 -> 22.39 events/op. Timing около 0.83–0.92 ms/op и шумен.                                                                                                      | Не оптимизировать вслепую: добавить allocation/reuse, detach, edge-move и cache-miss counters; затем выделить common churn shape из competitor `dynamic-branch`, `reorder`, `window-churn`.                 |
| P5        | Stack capacity                     | Pull trim начинается около depth=259, push trim около fanout=513. В fine sweep нет устойчивого timing cliff именно на onset.                                                                                                | Это hygiene, не primary bottleneck: измерить retained capacity/GC прежде изменения thresholds.                                                                                                              |

## Практическое решение

1. Считать V3 успешной semantic decomposition на common path: она делает
   обязательство явным и удерживает его в `pull_frontier`, вместо того чтобы
   платить за него на каждой push operation.
2. Не обещать «V3 быстрее» по одному aggregate benchmark. V3 покупает
   корректную exhaustive validation; её базовая цена пропорциональна ширине
   committed watcher frontier и не должна быть скрыта ранним exit.
3. Повторная push-доставка в shared root устранена через правило **active
   continuation owns its stable committed edge**. Следующий P0 — подтвердить
   выигрыш paired A/B и проверить, можно ли безопасно сократить оставшиеся
   transitive already-dirty visits. После этого идут **equal-result advance
   path** и **wide read-set layout**. V3 frontier и deep walker пока
   исследовательские направления; churn требует ещё instrumented evidence.

## Воспроизводимость

```sh
pnpm --filter @volynets/reflex-runtime test:projection
pnpm --filter @volynets/reflex-runtime bench:cost-attribution
pnpm --filter @volynets/reflex-runtime bench:pull-wide
```

`bench:pull-wide` сейчас — diagnostic timing probe. Его результат становится
артефактом для решения только вместе с profile-run, который подтверждает
число реально просмотренных V3 root edges.
