# 02. Публічний API: що реально експортує `@reflex/runtime`

Цей пакет експортує не high-level `createRuntime()`, а низькорівневі примітиви.

Головні групи API:

- node types і state constants
- producer/consumer read-write операції
- watcher lifecycle
- runtime context і hooks

## 1. `ReactiveNode`

Головний тип:

```ts
new ReactiveNode(payload, compute, initialState)
```

Типовий стартовий стан:

- `PRODUCER_INITIAL_STATE`
- `CONSUMER_INITIAL_STATE`
- `WATCHER_INITIAL_STATE`

### Producer

```ts
const source = new ReactiveNode(1, null, PRODUCER_INITIAL_STATE);
```

### Consumer

```ts
const derived = new ReactiveNode(
  undefined,
  () => readProducer(source) * 2,
  CONSUMER_INITIAL_STATE,
);
```

### Watcher

```ts
const watcher = new ReactiveNode(
  null,
  () => {
    console.log(readConsumer(derived));
  },
  WATCHER_INITIAL_STATE,
);
```

## 2. `readProducer()`

```ts
readProducer(source);
```

Робить дві речі:

- якщо є `runtime.activeComputed`, трекає edge через `trackRead()`
- повертає `payload`

Тут немає стабілізації графа.
Producer already committed on write.

## 3. `writeProducer()`

```ts
writeProducer(source, 10);
```

Поведінка:

1. порівнює старе і нове значення через `compare` (`Object.is`)
2. при no-op write нічого не робить
3. оновлює `payload`
4. очищає dirty bits producer-а
5. якщо є підписники, запускає `propagate(firstOut, true)`

Головна властивість:

- write path не recompute-ить downstream consumers

## 4. `readConsumer()`

```ts
readConsumer(node);
readConsumer(node, ConsumerReadMode.eager);
```

У lazy mode:

- спочатку стабілізує consumer
- потім трекає читання цього consumer-а як dependency для outer compute

У eager mode:

- стабілізує consumer в `untracked` режимі
- не додає outer dependency

Це корисно, коли треба force-refresh без побудови нового edge.

## 5. `runWatcher()` і `disposeWatcher()`

### `runWatcher()`

```ts
runWatcher(watcher);
```

Watcher:

- не запускається автоматично самим ядром
- host або hook policy вирішує, коли його реально виконати

`runWatcher()`:

- перевіряє dirty state
- при потребі rerun-ить watcher
- викликає попередній cleanup
- зберігає новий cleanup, якщо watcher його повернув

### `disposeWatcher()`

```ts
disposeWatcher(watcher);
```

Робить:

- `Disposed`
- unlink від джерел
- виклик cleanup
- очищення `payload`

## 6. `runtime`

Публічно доступний singleton context:

```ts
runtime.resetState();
runtime.setHooks({
  onEffectInvalidated(node) { ... },
  onReactiveSettled() { ... },
});
```

### `onEffectInvalidated`

Викликається, коли `propagate()` або `propagateOnce()` доходить до watcher-вузла.

Host може:

- скласти watcher у чергу
- запустити його одразу
- логувати invalidation

### `onReactiveSettled`

Викликається, коли:

- немає активного recompute
- `propagationDepth === 0`

Тобто після зовнішнього завершення поточного reactive burst.

## 7. State exports

Зверху експортуються також:

- `ReactiveNodeState`
- `DIRTY_STATE`
- `WALKER_STATE`
- `PRODUCER_CHANGED`
- `CONSUMER_CHANGED`
- `WATCHER_CHANGED`

Це корисно для:

- тестів
- інтеграції
- точкових low-level сценаріїв

## 8. Мінімальний end-to-end приклад

```ts
import {
  CONSUMER_INITIAL_STATE,
  PRODUCER_INITIAL_STATE,
  ReactiveNode,
  WATCHER_INITIAL_STATE,
  readConsumer,
  readProducer,
  runWatcher,
  runtime,
  writeProducer,
} from "@reflex/runtime";

const pending: ReactiveNode[] = [];

runtime.setHooks({
  onEffectInvalidated(node) {
    pending.push(node);
  },
});

const left = new ReactiveNode(1, null, PRODUCER_INITIAL_STATE);
const right = new ReactiveNode(2, null, PRODUCER_INITIAL_STATE);

const sum = new ReactiveNode(
  undefined,
  () => readProducer(left) + readProducer(right),
  CONSUMER_INITIAL_STATE,
);

const watcher = new ReactiveNode(
  null,
  () => {
    console.log(readConsumer(sum));
  },
  WATCHER_INITIAL_STATE,
);

runWatcher(watcher);
writeProducer(left, 10);

while (pending.length) {
  runWatcher(pending.shift());
}
```

## 9. Що цей API навмисно не робить

Він не дає:

- готового scheduler policy
- зручних фабрик рівня UI-framework
- окремого "lifecycle world" поверх watcher-ів

Це low-level kernel.
Його сила саме в тому, що read, write, watcher і hooks залишаються прозорими.
