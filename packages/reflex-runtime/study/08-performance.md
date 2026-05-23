# 08. Продуктивність: cost model поточного runtime

Цей розділ описує не абстрактний "найшвидший runtime",
а поточний профіль витрат `@reflex/runtime`.

Ключова ідея:

- дешевий write
- дешевий push invalidation
- селективний pull-side recompute
- дуже дешевий static tracking path

## 1. Що саме оптимізується

Поточний runtime оптимізує насамперед:

- steady-state статичний граф
- часткові читання
- ланцюжки та помірний fanout
- dynamic deps без важких структур

Менше оптимізується:

- сценарій, де після кожного write все одно читається "фінальний агрегат"
- важкий reorder churn
- host policy поверх watcher-ів

## 2. Головні hot path-и

### Push side

- `propagateLinear()`
- `propagateBranching()`
- `propagateOnce()`

### Pull side

- `shouldRecomputeLinear()`
- `shouldRecomputeBranching()`
- `recompute()`
- `executeNodeComputation()`

### Tracking maintenance

- `trackRead()`
- `reuseOrCreateIncomingEdge()`
- `cleanupStaleSources()`

## 3. Write path

`writeProducer()` дешевий, якщо:

- нове значення same-as-current
- або вузол не має subscribers

У такому разі вартість майже повністю сидить у:

- `compare()`
- одному commit у `payload`
- кількох state операціях

Якщо є subscribers, далі платимо вже за `propagate()`.

## 4. Вартість `propagate()`

Push-side вартість росте з:

- fanout
- наявністю branching
- кількістю watcher-ів
- кількістю tracking consumer-ів у середині cascade

Що важливо:

- linear path спеціально лишений плоским
- branching path тримає окремий resume stack
- clean-idle case відділений від slow path

Це design під JIT, а не лише під читабельність.

## 5. Вартість `shouldRecompute()`

Pull-side вартість росте з:

- fan-in конкретного consumer-а
- глибиною dirty subtree
- тим, скільки upstream вузлів реально треба refresh-ити

Але вона падає, якщо:

- upstream уже `Changed`
- dirty виявився хибною тривогою
- граф залишається лінійним

## 6. Static tracking path має бути константним на один read

Для статичного графа current runtime спирається на:

- `depsTail` hit
- `nextExpected` hit
- ранній return у `cleanupStaleSources()`

Це означає:

- repeated reads не повинні щоразу платити за повний incoming scan

Саме це перевіряють окремі JIT harness сценарії для tracking/connect.

## 7. Dynamic deps: де саме з'являється плата

Коли shape реально змінюється, платимо за:

- scan у `reuseOrCreateIncomingEdge()`
- reposition edge у списку
- suffix cleanup після compute

Це нормальна плата за branch switching.
Важливо не сам факт цієї плати, а те, щоб вона не просочувалася в static steady-state.

## 8. Watcher policy і perf

Kernel лише повідомляє watcher invalidation через hook.

Далі host сам вирішує:

- одразу виконувати watcher
- класти його в чергу
- батчити flush

Тому perf watcher-сценаріїв складається з двох шарів:

- kernel invalidation cost
- host scheduling policy

Не треба змішувати їх в одну цифру.

## 9. Найтиповіші perf-пастки

### Пастка 1. Занадто універсальний helper у hot loop

На кшталт:

- винести весь fast path у надто "красиву" спільну функцію
- сховати branching state в об'єкти-фрейми

Це легко б'є по JIT-формі коду.

### Пастка 2. Алокації там, де можна pointer math

Особливо болісно для:

- walker stack
- tracking maintenance
- edge reorder

### Пастка 3. Інструментація в ядрі

Perf counters усередині hot path майже завжди перекошують профіль.
Краще:

- тримати їх поза ядром
- або в окремих harness/scenario файлах

### Пастка 4. Лікувати churn ціною static fast path

Найгірший компроміс:

- трохи покращити reorder case
- але зіпсувати константний static read path

Для цього runtime static steady-state важливіший.

## 10. Як правильно міряти

Міряйте окремо:

- static graph
- reorder / branch switching
- push invalidation
- pull stabilization
- watcher hooks

І ще окремо:

- microbench функції
- end-to-end API сценарії

Бо це різні cost centers.

## 11. Де дивитися в коді

Для current perf-профілю насамперед важливі:

- `src/reactivity/walkers/propagate.ts`
- `src/reactivity/walkers/shouldRecompute.ts`
- `src/reactivity/engine/tracking.ts`
- `src/reactivity/shape/methods/connect.ts`
- `src/reactivity/engine/execute.ts`

Для відтворюваних JIT прогонів:

- `tests/perf/walkers.jit.mjs`
- `tests/perf/tracking-connect.jit.mjs`

## 12. Короткий висновок

Поточний runtime швидкий не тому, що "вміє все",
а тому, що він дисципліновано тримає короткими саме критичні шляхи:

- `writeProducer()`
- `propagate*()`
- `shouldRecompute*()`
- `trackRead()`
- `cleanupStaleSources()`

Якщо оптимізувати його далі, думати треба саме цими cost-centers,
а не абстрактними категоріями на кшталт "reactive runtime взагалі".
