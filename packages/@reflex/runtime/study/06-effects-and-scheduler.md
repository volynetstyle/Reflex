# 06. Watchers і host hooks: як побічні реакції винесені поверх ядра

Назва файлу історична, але в поточному runtime головний термін тут:

- `Watcher`

У пакеті немає вбудованого scheduler policy рівня "flush/eager mode".
Є watcher-вузли і hooks, через які host сам керує execution policy.

## 1. Чим watcher відрізняється від consumer

Consumer:

- повертає значення
- читається через `readConsumer()`
- downstream може залежати від його `payload`

Watcher:

- виконує код
- запускається через `runWatcher()`
- може повертати cleanup
- сам по собі не є значенням для downstream

## 2. Як watcher інвалідовується

Push-side `propagate()` і `propagateOnce()` доходять до watcher-вузла й не спускаються в нього далі.

Замість цього вони викликають:

```ts
runtime.dispatchWatcherEvent(node)
```

А `EngineContext` уже проксить це в:

```ts
hooks.onEffectInvalidated?.(node)
```

Тобто ядро лише сигналить:

- "цей watcher треба обробити"

А що саме робити далі, вирішує host.

## 3. Найпростіша host policy

Наприклад, host може тримати свою чергу:

```ts
const pending: ReactiveNode[] = [];

runtime.setHooks({
  onEffectInvalidated(node) {
    pending.push(node);
  },
});

while (pending.length) {
  runWatcher(pending.shift()!);
}
```

Це і є поточний scheduler seam.

## 4. `runWatcher()`

`runWatcher(node)` робить:

1. пропускає `Disposed`
2. якщо вузол не dirty або `shouldRecompute(node) === false`, просто чистить dirty state
3. інакше дістає попередній cleanup
4. скидає `payload` у `UNINITIALIZED`
5. знімає `Visited | DIRTY_STATE`
6. викликає попередній cleanup
7. запускає `executeNodeComputation()`
8. якщо watcher повернув функцію, зберігає її як новий cleanup

Тобто watcher має свій commit protocol поверх shared executor.

## 5. Чому watcher не просто "ще один consumer"

У watcher-а окрема семантика:

- cleanup before rerun
- cleanup on dispose
- host-driven scheduling
- відсутність downstream value contract

Якщо змішати це з consumer semantics, ядро швидко стане важчим і менш прозорим.

## 6. `disposeWatcher()`

`disposeWatcher()` робить:

- `disposeNode(node)`
- виклик cleanup, якщо він є
- очищення `payload`

Після цього watcher:

- від'єднаний від джерел
- більше не повинен інвалідовуватися

## 7. `onReactiveSettled`

Другий важливий hook:

```ts
runtime.setHooks({
  onReactiveSettled() {
    // host signal: reactive burst is done
  },
});
```

Він викликається лише коли:

- `propagationDepth === 0`
- `activeComputed === null`

Тобто не в середині cascade, а після зовнішнього завершення поточної реактивної роботи.

## 8. Що тут shared, а що policy

### Shared kernel logic

- `executeNodeComputation()`
- `trackRead()`
- `cleanupStaleSources()`
- cycle guards
- dirty / tracking protocol

### Host policy

- негайний запуск watcher-а
- запуск через чергу
- batched flush
- логування / telemetry / devtools

Саме тому current runtime лишається маленьким:
kernel не тягне на собі всі execution стратегії.

## 9. Що важливо не зламати

Під час refactor watcher path має зберігати:

- cleanup рівно один раз перед rerun
- cleanup рівно один раз на dispose
- коректне відновлення `activeComputed`
- коректне зняття `Tracking` і `Computing` навіть якщо compute кинув помилку
- `onReactiveSettled` тільки після outermost completion

## 10. Чому це хороший seam

Це дає просту архітектуру:

- producer/consumer core залишається focused на graph correctness
- watcher execution policy можна міняти окремо
- instrumentation можна тримати в hooks, а не в hot path walkers

Для low-level runtime це значно цінніше, ніж красивий, але жорстко вбудований scheduler.
