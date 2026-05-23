# 05. Динамічні залежності: як current runtime підтримує branch switching

Найскладніша частина реактивності тут не value change, а shape change.

Приклад:

```ts
const selected = new ReactiveNode(
  undefined,
  () => readProducer(flag) ? readProducer(left) : readProducer(right),
  CONSUMER_INITIAL_STATE,
);
```

Поки `flag === true`, вузол читає `left`.
Коли `flag === false`, він уже повинен читати `right`.

Старий edge до `left` має зникнути.

## 1. Що тут може піти не так

Якщо старий edge лишився:

- `left` стане phantom dependency
- future writes у `left` даремно інвалідовуватимуть `selected`
- граф почне брехати про актуальну форму залежностей

## 2. Підхід поточного runtime

Поточний runtime не використовує tracking epochs.

Він тримає shape через:

- порядок incoming edges
- cursor `depsTail`
- suffix cleanup після compute

Ідея така:

- новий compute rebuild-ить "живий" prefix списку `firstIn`
- усе, що лишилося після `depsTail`, вважається stale suffix

## 3. `trackRead()`

`trackRead(source)` працює лише коли є `runtime.activeComputed`.

Його fast path:

1. якщо `depsTail.from === source`, це прямий hit
2. якщо `depsTail.nextIn.from === source`, це expected-next hit
3. лише інакше він іде в slow path

Це дає дуже дешевий stable-state сценарій:

- статичний граф не сканується заново на кожному read

## 4. Slow path: `reuseOrCreateIncomingEdge()`

Коли fast path не спрацював, runtime:

- шукає edge далі в incoming списку
- якщо знаходить, reposition-ить його після `prev`
- якщо не знаходить, створює новий edge

Тобто slow path покриває:

- reorder
- branch switching
- появу нової dependency

## 5. `depsTail` як протокол

Під час compute:

- `depsTail` рухається зліва направо по новому dependency prefix

Уявна картина:

```text
firstIn -> [confirmed prefix ... depsTail] [stale suffix ... lastIn]
```

Після завершення compute:

- префікс лишається
- suffix відрізається

## 6. `cleanupStaleSources()`

Після compute runtime викликає:

```ts
cleanupStaleSources(node)
```

Вона:

- бере `tail = node.depsTail`
- визначає `staleHead = tail?.nextIn ?? node.firstIn`
- bulk-відрізає stale suffix від incoming списку
- передає відірвану послідовність у `unlinkDetachedIncomingEdgeSequence()`

Це важливо:

- cleanup не робиться read-by-read
- cleanup робиться один раз після завершення compute

## 7. Навіщо `Tracking`

Під час `executeNodeComputation()` вузол отримує `Tracking`.

У current runtime це означає:

- вузол зараз перебудовує dependency prefix
- не всі старі edges ще можна вважати валідними для invalidation

Тому push-side walker має спеціальне правило:

- tracking consumer можна інвалідувати лише через edge з already-confirmed prefix

Саме для цього існує `isTrackedPrefixEdge()`.

## 8. Навіщо `Visited` у tracking сценарії

Якщо під час compute в already-confirmed dependency прилітає invalidation,
`propagate()` залишає на вузлі:

- `Visited | Invalid`

Для pull-side це означає:

- поточне виконання побачило stale prefix
- вузол треба rerun-ити

## 9. Static shape fast path

На статичному графі maintenance overhead повинен бути константним на один read.

Саме для цього в коді є:

- hit по `depsTail`
- hit по `nextExpected`
- ранній return у `cleanupStaleSources()`, якщо `tail.nextIn === null`

Тобто steady-state граф платить за:

- курсор
- кілька pointer comparisons

а не за повний scan incoming list.

## 10. Branch switching приклад

Сценарій:

1. `flag = true`, вузол читає `flag` і `left`
2. incoming список містить edges до `flag` і `left`
3. `flag` змінюється на `false`
4. новий compute читає `flag` і `right`
5. `trackRead(right)` або перевикористовує edge, або створює новий
6. `cleanupStaleSources()` відрізає старий edge до `left`

Після цього:

- writes у `left` більше не повинні тривожити вузол
- writes у `right` повинні працювати далі

## 11. Не змішуйте shape logic з value logic

### Value logic

Питає:

- "чи змінився результат?"

Дивиться на:

- `Invalid`
- `Changed`
- `shouldRecompute()`
- `recompute()`

### Shape logic

Питає:

- "які edges досі справжні?"

Дивиться на:

- `depsTail`
- `trackRead()`
- `reuseOrCreateIncomingEdge()`
- `cleanupStaleSources()`

Коли ці два шари змішують, runtime швидко стає крихким.

## 12. Практичний тест на здоров'я dynamic deps

Після branch switch перевіряйте:

- stale source більше не інвалідовує вузол
- new source інвалідовує вузол
- кількість incoming edges не росте безконтрольно
- repeated reads на статичному графі не платять за повний scan

Саме ці речі і захищають current tests та JIT harness.
