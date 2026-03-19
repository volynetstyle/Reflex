# 04. Шляхи запису та читання: як граф стає брудним і свіжим

Цей розділ - серце reflex.

Треба зрозуміти два шляхи:

- write path
- read path

## 1. Write path: що відбувається на `signal.write()`

Псевдологіка:

```ts
if (Object.is(oldValue, newValue)) return;
payload = newValue;
t = bumpEpoch();
mark downstream Invalid;
```

І це все.

## 2. Чому write path такий короткий

Тому що reflex спеціально робить запис дешевим.

Якби write path одразу:

- йшов у recompute
- топологічно сортував graph
- виконував effects

то запис став би дорогим і погано передбачуваним.

У reflex write path - це інвалідатор, а не обчислювач.

## 3. `markInvalid`

Це обхід по `firstOut`.

Він іде вниз по downstream і робить:

- пропуск disposed nodes
- пропуск уже invalid nodes
- виставлення `Invalid`
- enqueue effect nodes через hook boundary

Ідея:

runtime швидко повідомляє графу:

"вам, можливо, треба буде перевіритися пізніше"

## 4. Чому `Invalid` не дорівнює "треба перерахувати"

Припустимо:

```ts
const b = computed(() => x() > 0 ? 1 : 1);
```

`x` може змінитися.
Але значення `b` не змінюється.

Якщо downstream автоматично вважати stale лише тому, що upstream invalid:

- буде багато зайвих recompute
- зникне SAC-оптимізація

Тому `Invalid` - це лише привід перевірити.

## 5. Read path: навіщо потрібен `ensureFresh`

Коли викликається `computed()`, runtime вирішує:

- чи можна одразу повернути кеш
- чи треба пройти шлях refresh

Якщо node dirty, викликається `ensureFresh(ctx, node)`.

Це основний алгоритм lazy refresh.

## 6. Як працює `ensureFresh`

Дуже грубо:

1. покласти target node у worklist
2. поки є робота:
3. взяти current node
4. якщо current clean, пропустити
5. якщо є dirty dependency, спочатку обробити її
6. якщо dirty dependencies уже свіжі, перевірити version mismatch
7. recompute лише якщо він справді потрібен

Тобто алгоритм робить:

- depth-first refresh dirty subgraph
- але лише по тих частинах, які справді потрібні поточному read

## 7. Чому спочатку dependencies, потім current

Тому що freshness current визначається через upstream versions.

Не можна коректно вирішити, stale current чи ні, якщо upstream ще не приведені
до свіжого стану.

Це інваріант topological correctness:

dependent recompute лише після upstream refresh.

## 8. `needsUpdateFromSourceT`

Це функція, яка відповідає на запитання:

"чи справді current stale?"

Вона дивиться на:

- `v === 0`
- `Obsolete`
- `max(source.t) > node.v`

Якщо жодна умова не спрацювала:

- node можна просто очистити від dirty flags
- recompute не потрібен

## 9. Чому `max(source.t)` - головний критерій freshness

Формально:

node is fresh iff node.v >= max(source.t)

Це дуже потужна ідея, тому що вона:

- проста
- дешева
- добре працює з SAC

Якщо всі parents мають `t <= node.v`, значить node бачив усі реальні value changes upstream.

## 10. Recompute path

Якщо node справді stale:

1. runtime запускає compute
2. під час compute трекає читання
3. після compute чистить stale dependencies, якщо потрібно
4. оновлює `v`
5. оновлює `t` лише якщо value справді змінився
6. чистить dirty state

Це ключовий момент:

- `v` оновлюється завжди після успішного recompute
- `t` оновлюється лише при реальному value change

## 11. Що дає SAC

SAC = same as current

Приклад:

```ts
const a = signal(1);
const b = computed(() => {
  a.read();
  return 100;
});
const c = computed(() => b() + 1);
```

Якщо `a` змінюється:

- `b` recompute
- `b.v` оновлюється
- `b.t` не оновлюється

Тоді `c` може не recompute.

Саме це робить reflex помітно ефективнішим у низці lazy workload.

## 12. `batchWrite`

`batchWrite` потрібен, щоб кілька source update отримали один epoch.

Це корисно, тому що:

- логічно це один write-batch
- downstream бачить узгоджений часовий зріз
- runtime не плодить зайві epoch increments

Але важливо:

`batchWrite` не перетворює reflex на eager runtime.

Він лише групує writes.

## 13. Mental model для читання коду

Коли читаєте `walkers.ts`, тримайте в голові:

- invalidation відповідає за "може бути брудно"
- ensureFresh відповідає за "зроби актуальним, якщо це справді потрібно"
- version check відповідає за "чи брудно по суті"

Це три різні шари, і їх не можна змішувати.
