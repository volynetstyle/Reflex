# 10. Карта вихідних файлів

Це актуальна карта current runtime.
Вона навмисно орієнтована на поточну структуру `src/`, а не на старі файли, яких уже немає.

## Рекомендований порядок читання

Якщо ви заходите в код уперше, ідіть так:

1. `src/index.ts`
2. `src/api/read.ts`
3. `src/api/write.ts`
4. `src/api/watcher.ts`
5. `src/reactivity/context.ts`
6. `src/reactivity/shape/ReactiveMeta.ts`
7. `src/reactivity/shape/ReactiveNode.ts`
8. `src/reactivity/shape/ReactiveEdge.ts`
9. `src/reactivity/shape/methods/connect.ts`
10. `src/reactivity/engine/execute.ts`
11. `src/reactivity/engine/tracking.ts`
12. `src/reactivity/engine/compute.ts`
13. `src/reactivity/walkers/propagate.ts`
14. `src/reactivity/walkers/shouldRecompute.ts`
15. `tests/runtime.semantic.test.ts`
16. `tests/runtime.traversal.test.ts`
17. `tests/runtime.hooks.test.ts`
18. `tests/perf/walkers.jit.mjs`
19. `tests/perf/tracking-connect.jit.mjs`

Чому саме так:

- спочатку зовнішні операції
- потім context і shape
- потім низькорівнева graph mechanics
- потім execution і tracking
- потім walkers
- і вже після цього тести та perf harness

## `src/index.ts`

Це вхідна точка пакета.

Тут видно:

- що пакет реально експортує
- які речі вважаються public low-level surface

Починати звідси корисно, щоб не будувати mental model по внутрішніх файлах, яких узагалі немає в public surface.

## `src/api/read.ts`

Це головний read seam.

Тут живуть:

- `readProducer()`
- `readConsumer()`
- `ConsumerReadMode`

Що читати:

- як consumer стабілізується
- коли викликається `shouldRecompute()`
- коли викликається `recompute()`
- коли consumer read іде в `untracked`

## `src/api/write.ts`

Це головний write seam.

Тут живе:

- `writeProducer()`

Що читати:

- no-op write fast path
- producer commit
- entry у `propagate()`
- `runtime.enterPropagation()` / `leavePropagation()`

## `src/api/watcher.ts`

Це watcher lifecycle.

Тут живуть:

- `runWatcher()`
- `disposeWatcher()`

Що читати:

- як watcher вирішує, чи потрібен rerun
- як cleanup знімається і ставиться знову
- як watcher використовує `executeNodeComputation()`

## `src/reactivity/context.ts`

Тут shared runtime context.

Ключові поля:

- `activeComputed`
- `propagationDepth`
- `cleanupRegistrar`
- `hooks`

Саме цей файл пояснює, як tracking і host hooks взагалі стикуються з ядром.

## `src/reactivity/shape/ReactiveMeta.ts`

Тут state bits і маски.

Почитайте насамперед:

- `ReactiveNodeState`
- `DIRTY_STATE`
- `WALKER_STATE`

Це словник термінів для всього runtime.

## `src/reactivity/shape/ReactiveNode.ts`

Тут shape вузла.

Дивіться на:

- `payload`
- `compute`
- `firstIn/firstOut`
- `lastIn/lastOut`
- `depsTail`

Саме після цього файла починає бути зрозуміло, як runtime живе без окремих "signal/computed/effect objects".

## `src/reactivity/shape/ReactiveEdge.ts`

Тут shape ребра.

Це короткий файл, але дуже важливий:

- один edge живе в двох списках
- будь-який pointer rewrite має зберігати обидва представлення графа узгодженими

## `src/reactivity/shape/methods/connect.ts`

Це низькорівнева graph surgery.

Головні речі:

- `linkEdge()`
- `unlinkEdge()`
- `reuseOrCreateIncomingEdge()`
- `unlinkDetachedIncomingEdgeSequence()`
- `unlinkAllSources()`

Цей файл треба читати, якщо вас цікавлять:

- dynamic deps
- disposal
- pointer-level hot path

## `src/reactivity/engine/execute.ts`

Shared executor для вузлів із `compute`.

Що читати:

- встановлення `Tracking`
- встановлення `Computing`
- перемикання `activeComputed`
- виклик `cleanupStaleSources()`
- `runtime.maybeNotifySettled()`

## `src/reactivity/engine/tracking.ts`

Це dependency tracking шар.

Тут живуть:

- `trackRead()`
- `cleanupStaleSources()`

Що важливо:

- fast path для статичного графа
- `depsTail` протокол
- suffix cleanup після compute

## `src/reactivity/engine/compute.ts`

Тут commit логіка consumer recompute.

Короткий, але важливий файл:

- бере попередній `payload`
- робить execute
- визначає `changed`
- чистить `DIRTY_STATE`

## `src/reactivity/walkers/propagate.ts`

Push-side walker.

Тут дивіться:

- `propagateLinear()`
- `propagateBranching()`
- `propagateOnce()`
- tracking-aware invalidation

Якщо цікаво, як write іде вниз по графу, це ваш файл.

## `src/reactivity/walkers/shouldRecompute.ts`

Pull-side walker.

Тут дивіться:

- `shouldRecomputeLinear()`
- `shouldRecomputeBranching()`
- `refreshDependency()`

Це файл про:

- upstream stabilization
- branching DFS
- рішення "чи потрібен recompute зараз"

## Тести

### `tests/runtime.semantic.test.ts`

Тут хороші приклади:

- same-as-current
- eager read mode
- dynamic deps

### `tests/runtime.traversal.test.ts`

Тут хороші приклади:

- diamond graph
- watcher invalidation
- tracked prefix behavior

### `tests/runtime.hooks.test.ts`

Тут видно:

- `onEffectInvalidated`
- `onReactiveSettled`
- nested propagation через hooks

## Perf harness

### `tests/perf/walkers.jit.mjs`

Корисний для:

- `propagate`
- `shouldRecompute`
- `executeNodeComputation`
- API level scenarios

### `tests/perf/tracking-connect.jit.mjs`

Корисний для:

- `trackRead`
- `reuseOrCreateIncomingEdge`
- `cleanupStaleSources`
- static vs reorder scenarios

## Якщо ви прийшли міняти runtime

Найкорисніший короткий маршрут:

1. `src/reactivity/shape/ReactiveMeta.ts`
2. `src/reactivity/shape/ReactiveNode.ts`
3. `src/reactivity/engine/execute.ts`
4. `src/reactivity/engine/tracking.ts`
5. `src/reactivity/walkers/propagate.ts`
6. `src/reactivity/walkers/shouldRecompute.ts`

Після цього вже йдіть у конкретний шар, який чіпає ваша задача.

## Короткий висновок

Поточний runtime найкраще читати не як "один великий engine",
а як набір коротких, дуже конкретних шарів:

- API
- context
- shape
- connect
- execute
- tracking
- push walker
- pull walker
- tests
- perf harness

Такий порядок значно краще відповідає реальному коду, ніж стара карта з `core.ts`, `walkers.ts` і `tracking.ts`.
