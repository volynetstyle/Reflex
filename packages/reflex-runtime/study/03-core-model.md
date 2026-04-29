# 03. Модель ядра: вузли, ребра, стан і runtime context

## 1. `ReactiveNode`

Поточний runtime тримається на одному базовому shape:

```ts
class ReactiveNode<T = unknown> {
  state: number;
  compute: (() => T) | null;
  firstOut: ReactiveEdge | null;
  firstIn: ReactiveEdge | null;
  lastOut: ReactiveEdge | null;
  lastIn: ReactiveEdge | null;
  depsTail: ReactiveEdge | null;
  payload: T;
}
```

Тут немає окремих класів для signal/computed/watcher.
Роль вузла визначається комбінацією:

- `state`
- `compute`
- семантики `payload`

## 2. `payload`

Сенс `payload` залежить від ролі вузла.

### Producer

- поточне значення джерела

### Consumer

- кешоване обчислене значення

### Watcher

- `cleanup` функція або `UNINITIALIZED` / `null`

Це важлива частина мінімалістичного дизайну:
один shape, різна семантика поверх нього.

## 3. `compute`

### Producer

- `compute === null`

### Consumer

- функція derivation

### Watcher

- функція side effect body

`executeNodeComputation()` працює однаково для consumer-ів і watcher-ів.
Різниця з'являється вже на етапі commit policy.

## 4. `ReactiveEdge`

Кожне ребро живе одночасно у двох списках:

- у source як outgoing edge
- у target як incoming edge

Shape:

```ts
interface ReactiveEdge {
  from: ReactiveNode;
  to: ReactiveNode;
  prevOut: ReactiveEdge | null;
  nextOut: ReactiveEdge | null;
  prevIn: ReactiveEdge | null;
  nextIn: ReactiveEdge | null;
}
```

Це означає:

- `propagate()` іде по `firstOut`
- `shouldRecompute()` іде по `firstIn`
- `trackRead()` і `cleanupStaleSources()` перебудовують саме incoming список consumer-а

## 5. Навіщо `depsTail`

`depsTail` - це cursor у списку `firstIn ... lastIn`.

Під час активного compute він означає:

- "ось до цього місця dependency prefix уже підтверджений новим проходом"

Саме навколо цього курсора працюють:

- fast hit у `trackRead()`
- reorder у `reuseOrCreateIncomingEdge()`
- suffix cleanup у `cleanupStaleSources()`

Для статичного графа це дуже важливо:

- повторні читання можуть коштувати константно на один read

## 6. State bits

Поточний runtime використовує такі основні bits:

- `Producer`
- `Consumer`
- `Watcher`
- `Invalid`
- `Changed`
- `Visited`
- `Disposed`
- `Computing`
- `Scheduled`
- `Tracking`

### Рольові bits

- `Producer`
- `Consumer`
- `Watcher`

Вони кажуть, що це за вузол.

### Dirty bits

- `Invalid`
- `Changed`

Ключова маска:

```ts
DIRTY_STATE = Invalid | Changed
```

`Invalid` означає "перевір".
`Changed` означає "зміна вже підтверджена".

### Walker bits

- `Visited`
- `Tracking`

Ключова маска:

```ts
WALKER_STATE = Visited | Tracking
```

Вони використовуються push/pull walker-ами і dependency tracking.

### Lifecycle bits

- `Disposed`
- `Computing`
- `Scheduled`

Вони потрібні для:

- захисту від циклів
- watcher queue dedupe
- відсікання мертвих вузлів

## 7. `ReactiveMeta` helpers

Пакет тримає короткі helpers поверх state bits:

- `markNodeComputing()`
- `clearNodeComputing()`
- `clearDirtyState()`
- `isDisposedNode()`

Ідея проста:

- runtime не дублює стан окремими булевими полями
- у hot path читаються й пишуться конкретні bits

## 8. `EngineContext`

Shared mutable context:

```ts
class EngineContext {
  activeComputed: ReactiveNode | null;
  propagationDepth: number;
  cleanupRegistrar: CleanupRegistrar | null;
  hooks: EngineHooks;
}
```

### `activeComputed`

Вузол, який зараз виконує `compute`.

Його читає `trackRead()`, щоб знати, куди прикріплювати dependency edges.

### `propagationDepth`

Лічильник вкладеного push invalidation.

Потрібен для:

- коректного `onReactiveSettled`
- host hooks без фальшивих settled-сигналів у середині propagation cascade

### `cleanupRegistrar`

Службовий seam для cleanup registration.
Це не частина walkers/tracking протоколу.

### `hooks`

Поточні host hooks:

- `onEffectInvalidated`
- `onReactiveSettled`

## 9. Чому модель така компактна

Ця модель хороша тим, що всі гарячі шляхи працюють з невеликим набором полів:

- `payload`
- `state`
- `firstOut`
- `firstIn`
- `depsTail`

А складніший policy layer залишається зовні.

Тому в подальших главах ми будемо дивитися на runtime не через "великі абстракції",
а через прямі переходи:

- write -> propagate
- read -> shouldRecompute -> recompute
- compute -> trackRead -> cleanupStaleSources
