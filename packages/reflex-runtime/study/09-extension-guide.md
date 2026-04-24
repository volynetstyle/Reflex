# 09. Як розширювати current runtime без втрати форми

У цього пакета маленьке ядро.
Його головна сила не в "універсальності", а в коротких і передбачуваних hot path-ах.

Тому хороший extension strategy тут така:

- додавати поведінку по seams
- не розмазувати семантику по всьому ядру

## 1. Хороші seams

### `src/api/read.ts`

Тут живе policy читання:

- `readProducer()`
- `readConsumer()`
- `ConsumerReadMode`

Це правильне місце для:

- нових read режимів
- untracked / eager варіацій
- host-level read semantics

### `src/api/write.ts`

Тут живе producer commit + entry у push invalidation:

- `writeProducer()`

Це seam для:

- альтернативного compare policy
- host wrappers навколо producer writes

Але не місце для eager recompute графа.

### `src/api/watcher.ts`

Тут живе watcher lifecycle:

- `runWatcher()`
- `disposeWatcher()`

Це правильна зона для:

- watcher cleanup policy
- host-facing watcher helpers

### `src/reactivity/context.ts`

Тут живуть:

- `activeComputed`
- `propagationDepth`
- `onEffectInvalidated`
- `onReactiveSettled`

Це природний seam для:

- devtools
- tracing
- host queues
- telemetry

### `src/reactivity/engine/execute.ts`

Shared executor для вузлів із `compute`.

Гарне місце для:

- протоколу виконання
- cycle safety
- спільного enter/leave execution

### `src/reactivity/engine/tracking.ts`

Тут живе dynamic dependency maintenance:

- `trackRead()`
- `cleanupStaleSources()`

Сюди варто йти, якщо задача пов'язана з:

- статичним fast path на read
- branch switching
- stale suffix cleanup

### `src/reactivity/shape/methods/connect.ts`

Тут живе low-level graph surgery:

- `linkEdge()`
- `unlinkEdge()`
- `reuseOrCreateIncomingEdge()`
- `unlinkAllSources()`

Це місце для pointer-level роботи.

### `src/reactivity/walkers/*.ts`

Тут живуть обидва walker-и:

- push side в `propagate.ts`
- pull side в `shouldRecompute.ts`

Саме тут не можна бездумно тягнути "красиві" абстракції в hot path.

## 2. Що не треба робити

### Не додавайте тіньовий стан

На кшталт:

- `node.isDirty`
- `node.kind`
- окремий dependency cache поза edge-списком

Якщо семантика вже виражена через:

- `state`
- `compute`
- `payload`
- `depsTail`
- edge lists

то дубль майже завжди погіршує архітектуру.

### Не зливайте push і pull семантику

`propagate()` і `shouldRecompute()` відповідають на різні питання.

Не треба:

- робити write path "розумним recompute-пайплайном"
- або навпаки тягнути push-side policy у pull walker

### Не ховайте hot path за зайвими універсальними helper-ами

Особливо чутливі місця:

- `propagateLinear()`
- `propagateBranching()`
- `shouldRecomputeLinear()`
- `trackRead()`

Тут форма коду для JIT важлива не менше за читабельність.

## 3. Що ламати не можна

Під час будь-якого розширення мають зберігатися такі закони.

### Закон 1. `writeProducer()` не recompute-ить downstream

Він:

- комітить producer
- запускає push invalidation

І тільки.

### Закон 2. `Invalid` і `Changed` не зливаються

`Invalid`:

- maybe stale

`Changed`:

- confirmed change

### Закон 3. `depsTail` лишається єдиним протоколом dynamic deps

Не можна тихо обійти його додатковим side cache.

### Закон 4. `cleanupStaleSources()` лишається post-compute операцією

Не можна рвати incoming links посеред compute.

### Закон 5. Watcher execution policy лишається зовні

Kernel тільки:

- повідомляє invalidation
- дає `runWatcher()`

Host policy вирішує, коли його викликати.

## 4. Як думати про нову можливість

Питайте себе так:

1. Це зміна graph semantics?
2. Це зміна read/write policy?
3. Це watcher host policy?
4. Це лише dev tooling?

Приклади:

- новий queue policy для watcher-ів -> hooks / host layer
- новий compare mode для producer write -> `api/write.ts`
- новий tracking fast path -> `engine/tracking.ts` + `shape/methods/connect.ts`
- зміна pull-side refresh protocol -> `walkers/shouldRecompute.ts`

## 5. Практичний порядок роботи

Якщо ви змінюєте runtime:

1. Спочатку визначте, який саме seam чіпаєте.
2. Випишіть інваріанти, які мають лишитися істинними.
3. Змініть код у найвужчому можливому місці.
4. Перевірте semantic tests.
5. Окремо перевірте perf на static і churn сценаріях.

## 6. Мінімальний checklist перед merge

### Коректність

- `tests/runtime.semantic.test.ts`
- `tests/runtime.traversal.test.ts`
- `tests/runtime.hooks.test.ts`
- `tests/runtime.lifecycle.test.ts`

### Perf

- static graph не просів
- reorder / branch switching не зламався
- write path не став товстішим

### Архітектура

- не з'явився дублюючий стан
- не з'явився новий важкий універсальний шар
- host policy не протекла в walkers/trackers

## 7. Короткий висновок

Розширювати цей runtime безпечно, якщо тримати в голові просте правило:

- shape logic у `tracking` / `connect`
- push logic у `propagate`
- pull logic у `shouldRecompute`
- execution protocol у `execute`
- host policy у hooks і watcher layer

Як тільки ці межі розмиваються, система стає одночасно і повільнішою, і важчою для пояснення.
