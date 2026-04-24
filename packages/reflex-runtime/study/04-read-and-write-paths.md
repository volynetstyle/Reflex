# 04. Шляхи запису і читання: як працює current runtime

У поточному дизайні є два ключові шляхи:

- `writeProducer()` для push invalidation
- `readConsumer()` для lazy stabilization

## 1. Write path: `writeProducer()`

Псевдологіка:

```ts
if (compare(oldValue, nextValue)) return;

node.payload = nextValue;
node.state &= ~DIRTY_STATE;

if (node.firstOut !== null) {
  runtime.enterPropagation();
  try {
    propagate(node.firstOut, true);
  } finally {
    runtime.leavePropagation();
  }
}
```

Ключові властивості:

- no-op write відсікається відразу
- producer комітить значення одразу
- downstream не recompute-иться на write path

## 2. Навіщо `propagate(..., true)`

Другий аргумент означає:

- direct subscribers producer-а можна одразу промоутити до `Changed`

Це важливо, бо producer already committed.
Downstream не треба заново доводити зміну через pull-side walk.

## 3. `propagate()`

Push-side walker іде по outgoing edges.

У поточному коді він розщеплений на:

- `propagateLinear()`
- `propagateBranching()`

### `propagateLinear()`

Швидкий шлях для:

- лінійного ланцюжка
- випадку без sibling-resume stack

### `propagateBranching()`

Вмикається, коли з'являється реальний fanout і потрібен stack для resume.

### Що walker робить з subscriber-ом

Він:

- пропускає вже dirty або disposed вузли
- ставить `Changed` або `Invalid`
- окремо обробляє tracking case
- повідомляє watcher invalidation через hook

## 4. `Invalid` проти `Changed`

Це один із головних семантичних поділів runtime.

### `Invalid`

Означає:

- вузол треба перевірити

### `Changed`

Означає:

- зміна вже підтверджена
- `shouldRecompute()` можна не робити

Саме на цьому стоїть cheap push + lazy pull модель.

## 5. Read path: `readProducer()`

`readProducer()`:

- трекає залежність, якщо є `activeComputed`
- повертає `payload`

Producer не стабілізується на read,
бо його payload уже committed на write.

## 6. Read path: `readConsumer()`

`readConsumer()` спочатку викликає `stabilizeConsumer(node)`.

Псевдологіка:

```ts
if ((state & DIRTY_STATE) !== 0) {
  const needs =
    (state & Changed) !== 0 || shouldRecompute(node);

  if (needs) {
    if (recompute(node)) propagateOnce(node);
  } else {
    clearDirtyState(node);
  }
}
```

Потім:

- у lazy mode ще викликається `trackRead(node)`
- у eager mode стабілізація йде в `untracked()`

## 7. Навіщо `shouldRecompute()`

`Invalid` саме по собі не доводить, що consumer треба recompute-ити.

Можливий сценарій:

- producer інваліднув consumer
- але upstream recompute у підсумку виявився same-as-current

Тому `shouldRecompute()`:

- проходить по incoming dependencies
- refresh-ить dirty upstream вузли в правильному порядку
- повертає `true` лише якщо реальна зміна підтвердилась

## 8. `shouldRecompute()` у поточному коді

Pull-side walker теж розщеплений на:

- `shouldRecomputeLinear()`
- `shouldRecomputeBranching()`

Він:

- іде по `firstIn`
- тримається на дешевому linear path, поки немає branching
- при потребі спускається в dirty subtrees
- refresh-ить dependency через `refreshDependency()`

Особливий fast path:

- якщо dependency вже `Changed`, додаткова pull-side перевірка не потрібна

## 9. `recompute()`

`recompute(node)` не містить усю compute-механіку всередині себе.

Він:

- бере попередній `payload`
- викликає `executeNodeComputation()`
- у commit closure вирішує, чи результат реально змінився
- оновлює `payload`
- очищає `DIRTY_STATE`

Повертає:

- `true`, якщо результат змінився
- `false`, якщо recompute був same-as-current

## 10. `executeNodeComputation()`

Це shared executor для consumer-ів і watcher-ів.

Він:

1. перевіряє cycle / відсутність `compute` у dev
2. скидає `depsTail = null`
3. виставляє `Tracking`
4. виставляє `Computing`
5. перемикає `runtime.activeComputed`
6. запускає `compute`
7. викликає `cleanupStaleSources(node)`
8. робить commit
9. знімає `Tracking` і `Computing`
10. викликає `runtime.maybeNotifySettled()`

## 11. Навіщо `propagateOnce()`

Коли `recompute(node)` повертає `true`, треба ще промоутити sibling subscribers.

Саме це робить `propagateOnce(node)`:

- проходить лише прямий `firstOut`
- промоутить `Invalid -> Changed`
- повідомляє watcher-ів

Важливий момент:

- це не повний recursive push
- це shallow sideways propagation після confirmed change

## 12. Eager consumer read

`ConsumerReadMode.eager` не робить runtime eager globally.

Він лише:

- стабілізує конкретний consumer без побудови outer dependency

Це точковий інструмент, а не інша архітектура.

## 13. Головна mental model

У current runtime шари розділені так:

- `writeProducer()` каже "щось змінилося"
- `propagate()` каже "кого це потенційно зачепило"
- `shouldRecompute()` каже "чи є реальна причина recompute"
- `recompute()` каже "онови payload"
- `trackRead()` і `cleanupStaleSources()` кажуть "які dependency edges тепер справжні"

Якщо ці шари не змішувати, код залишається і коректним, і читабельним.
