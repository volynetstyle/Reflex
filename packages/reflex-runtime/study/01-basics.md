# 01. База: що таке цей reactive runtime

## 1. Що саме тут є

Поточний `@reflex/runtime` працює з трьома ролями вузлів:

- `Producer` - зберігає значення
- `Consumer` - кешує похідне значення
- `Watcher` - виконує побічний код і може повертати cleanup

Усе це один shape:

- `ReactiveNode`

Різниця між ролями задається не окремими класами, а state bits і наявністю `compute`.

## 2. Producer, consumer, watcher

### Producer

Producer:

- має `payload`
- не має `compute`
- оновлюється через `writeProducer()`

### Consumer

Consumer:

- має `compute`
- кешує останній `payload`
- читається через `readConsumer()`

### Watcher

Watcher:

- теж має `compute`
- не повертає корисне значення для downstream
- виконується через `runWatcher()`
- може зберігати cleanup у `payload`

## 3. Push і pull у поточній моделі

Runtime комбінує два режими:

- push invalidation на write
- pull stabilization на read

Тобто:

- `writeProducer()` не перераховує весь граф
- він лише оновлює producer і запускає `propagate()`
- `readConsumer()` уже на demand вирішує, чи потрібен реальний recompute

Саме це дає cheap write path і selective read path.

## 4. Що означає "граф"

Граф зберігається як ребра між вузлами:

```text
producer -> consumer -> watcher
```

Ребро читається так:

- `to` залежить від `from`

Тобто якщо є edge `from = a`, `to = b`, це означає, що `b` читає `a`.

## 5. Які стани важливі насамперед

У базовому розумінні вистачає таких bits:

- `Invalid` - вузол треба перевірити
- `Changed` - зміна вже підтверджена
- `Tracking` - вузол зараз перебудовує dependency prefix
- `Visited` - walker marker для спеціальних re-entrancy випадків
- `Computing` - вузол зараз виконує `compute`
- `Disposed` - вузол більше не бере участі в графі

Ключова маска:

```ts
DIRTY_STATE = Invalid | Changed
```

## 6. Найважливіша mental model

Думайте так:

- producer комітить значення одразу
- consumer не поспішає recompute-итися на кожен write
- watcher узагалі не є "значенням", це host-side execution point
- ребра кажуть лише "хто кого читав"

І ще коротше:

- write робить вузли підозрілими
- read доводить, чи треба recompute
- tracking підтримує правильну форму залежностей

## 7. Мінімальний приклад

```ts
import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  readConsumer,
  readProducer,
  writeProducer,
} from "@reflex/runtime";

const count = new ReactiveNode(1, null, PRODUCER_INITIAL_STATE);
const double = new ReactiveNode(
  undefined,
  () => readProducer(count) * 2,
  CONSUMER_INITIAL_STATE,
);

console.log(readConsumer(double)); // 2
writeProducer(count, 5);
console.log(readConsumer(double)); // 10
```

Що тут сталося:

1. перший `readConsumer(double)` виконав `compute` і побудував edge `count -> double`
2. `writeProducer(count, 5)` інвалідував downstream
3. другий `readConsumer(double)` стабілізував `double` і recompute-нув його лише тоді

## 8. Чому це low-level runtime

Цей пакет навмисно не приховує механіку за великим ergonomics-шаром.

Він дає примітиви:

- вузли
- ребра
- walkers
- tracking
- hooks

А policy layer поверх цього може бути різним.

Саме тому далі в `study` мова піде не про "магічні сигнали",
а про конкретні структури даних і конкретні переходи стану.
