# 07. Інваріанти, dev guards і production semantics

Поточний runtime маленький, але дуже чутливий до дрібних порушень протоколу.

Нижче не "абстрактна теорія", а список речей, які мусять лишатися істинними,
щоб walkers, tracking і watcher hooks не розповзлися.

## 1. Producer write комітить значення одразу

Після успішного `writeProducer(node, value)`:

- `node.payload` уже містить нове значення
- `node.state` не містить `DIRTY_STATE`

Push path downstream-ом займається окремо через `propagate()`.

## 2. `DIRTY_STATE` означає лише `Invalid | Changed`

У current runtime dirty protocol стоїть на двох bits:

- `Invalid`
- `Changed`

Не можна потай додавати в dirty semantics інші bits.

### `Invalid`

- "цей вузол треба перевірити"

### `Changed`

- "зміна вже підтверджена"

Це різні речі, і саме на цьому тримається cheap write + selective recompute.

## 3. `compute` виконується тільки під `Tracking` і `Computing`

Під час `executeNodeComputation(node, ...)` має бути істинно:

- `node.state & Tracking`
- `node.state & Computing`
- `runtime.activeComputed === node`
- `node.depsTail === null` на старті compute

Після завершення:

- `Tracking` знятий
- `Computing` знятий
- `runtime.activeComputed` відновлений

## 4. Dynamic deps оновлюються через prefix/suffix протокол

Під час compute:

- `trackRead()` рухає `depsTail` по новому живому prefix

Після compute:

- `cleanupStaleSources()` видаляє suffix після `depsTail`

Не можна:

- вручну відв'язувати edges посеред compute
- перескакувати через suffix cleanup
- тримати окремий "тіньовий" список dependencies поза цим протоколом

## 5. Один edge має бути синхронним у двох списках

Кожне `ReactiveEdge` живе одразу в:

- outgoing списку source-а
- incoming списку target-а

Будь-який `link` / `unlink` / `move` повинен лишати обидві проекції графа узгодженими.

Саме тому `connect.ts` такий pointer-heavy:
тут correctness важливіша за красиву абстракцію.

## 6. Tracking invalidation допускається лише для confirmed prefix

Коли consumer має `Tracking`, push walker не може безумовно інвалідовувати будь-який старий edge.

Потрібне правило:

- інвалідовуємо лише edge з already-confirmed prefix

Інакше stale suffix міг би фальшиво rerun-ити вузол через dependency, яку він уже перестав читати.

## 7. `Visited | Invalid` має особливий сенс

Якщо tracking consumer отримав invalidation через confirmed prefix,
runtime лишає:

- `Visited | Invalid`

Pull-side трактує це як:

- "поточне виконання побачило stale prefix, потрібен rerun"

Не можна випадково знести цей маркер надто широкою cleanup-маскою.

## 8. `shouldRecompute()` не повинен дублювати work без причини

Поточний pull walker має гарантувати:

- лінійний fast path без стеку, якщо branching немає
- branching DFS лише коли він реально потрібен
- refresh dependency перед recompute поточного consumer-а

Можливий рефакторинг форми коду,
але не можна зламати сам порядок:

- спочатку upstream stabilization
- потім рішення про recompute current node

## 9. `propagate()` не recompute-ить graph

Push-side walker має лише:

- ставити `Invalid` або `Changed`
- повідомляти watcher invalidation
- обійти downstream tree

Він не повинен:

- запускати compute
- тягнути scheduler policy
- доводити same-as-current

## 10. Disposed вузли перестають брати участь у графі

Після `disposeNode()` або `disposeWatcher()`:

- `Disposed` виставлений
- входи відчеплені
- вузол більше не бере участі в push/pull

Це стосується і correctness, і perf:
мертві вузли не повинні висіти phantom links.

## 11. `onReactiveSettled` не повинен стріляти завчасно

`runtime.maybeNotifySettled()` має викликати hook лише коли:

- `propagationDepth === 0`
- `activeComputed === null`

Інакше host отримає "settled" посеред активної reactive cascade.

## 12. Dev guards і prod semantics

### Dev-only перевірки

У dev режимі current runtime має ловити:

- спробу виконати вузол без `compute`
- цикл через повторний вхід у `Computing`

### Продакшн semantics

У prod повинні лишатися:

- самі state transitions
- dirty/tracking protocol
- hooks bookkeeping

Не можна вирізати correctness логіку разом із diagnostics.

## 13. Хороший mental checklist перед рефакторингом

Перед merge корисно пройтися питаннями:

1. Чи лишається `writeProducer()` cheap і non-recomputing?
2. Чи не злив я `Invalid` і `Changed` в одну нечітку семантику?
3. Чи рухається `depsTail` так само коректно на статичному графі?
4. Чи suffix cleanup усе ще відрізає stale edges після compute?
5. Чи tracking invalidation усе ще дивиться тільки на confirmed prefix?
6. Чи watcher cleanup і runtime bookkeeping відновлюються навіть при throw?

Якщо хоча б на одне питання відповідь "не впевнений",
рефакторинг ще не готовий.
