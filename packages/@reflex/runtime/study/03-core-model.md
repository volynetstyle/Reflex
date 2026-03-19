# 03. Модель ядра: вузли, ребра, прапори, епохи

Якщо хочете глибоко розуміти reflex, треба зрозуміти структуру даних.

## 1. `ReactiveNode`

Це головний об'єкт runtime.

Вузол зберігає:

- роль вузла
- поточне значення
- compute-функцію
- прапори стану
- версії
- зв'язки з graph

У поточній реалізації ключові поля такі:

- `kind`
- `t`
- `v`
- `state`
- `compute`
- `payload`
- `s`
- `w`
- `firstOut`
- `firstIn`

## 2. `kind`

`kind` - це явна семантична роль вузла:

- `Signal`
- `Computed`
- `Effect`

Навіщо це потрібно, якщо вже є `compute` і state bits:

- семантика вузла стає явною
- розширення не зав'язані на непрямі ознаки
- scheduler і graph logic можуть ухвалювати рішення дешевше та зрозуміліше

Це архітектурний seam.

## 3. `payload`

`payload` - це те, що зараз зберігає вузол.

Для різних вузлів сенс відрізняється:

- у `signal` це поточне значення source
- у `computed` це кеш обчисленого значення
- у `effect` це cleanup-функція або `null`

Це важливий приклад мінімалізму:

замість трьох різних shapes runtime використовує один спільний vertex shape.

## 4. `compute`

`compute` - функція перерахунку.

- у `signal` вона `null`
- у `computed` це derivation
- у `effect` це body effect

## 5. Епохи: `t`, `v`, `s`, `w`

### `t`

Epoch зміни значення.

Якщо observable value справді змінився, рухається `t`.

### `v`

Epoch останньої успішної валідації/перерахунку.

Якщо вузол перерахувався й став свіжим, оновлюється `v`.

### `s`

Tracking epoch для поточного recompute pass.

Він потрібен, щоб після recompute зрозуміти:

- які inbound edges були справді прочитані
- які стали stale

### `w`

Маркер поточного work pass у `ensureFresh`.

Він потрібен для dedupe під час обходу dirty graph без зайвих `Set`.

## 6. Чому `t` і `v` розділені

Це одна з центральних ідей reflex.

Якби був лише один version counter, runtime не міг би добре підтримувати SAC:

same as current

Приклад:

```ts
const b = computed(() => {
  x();
  return 42;
});

const c = computed(() => b() + 1);
```

Якщо `x` змінився, `b` справді recompute.
Але його значення залишилося `42`.

Що потрібно:

- `b.v` має оновитися, бо `b` перерахований
- `b.t` не має оновитися, бо observable value не змінився

Тоді `c` побачить:

- upstream був перевірений
- але його значення не змінювалося

і зможе не recompute.

Це і є selective recomputation.

## 7. `ReactiveEdge`

Ребро зберігає зв'язок:

- `from`
- `to`
- `nextOut`
- `nextIn`
- `s`

Чому linked lists, а не arrays:

- простіше дешеве додавання без realloc
- зручно обходити `firstOut` і `firstIn`
- менше зайвої структури в мінімалістичному ядрі

Мінус:

- локальність пам'яті гірша, ніж у щільних масивів

Але для поточного профілю reflex це припустимий компроміс.

## 8. Outbound і inbound списки

У кожного node є два напрямки.

### `firstOut`

Список consumers цього вузла.

Потрібен для:

- invalidation downstream
- обходу від source до залежних вузлів

### `firstIn`

Список dependencies цього вузла.

Потрібен для:

- freshness checks
- recompute logic
- stale edge cleanup

## 9. `EngineContext`

Це shared mutable context runtime.

Він зберігає:

- `epoch`
- `activeComputed`
- traversal stacks
- hooks

### Чому context важливий

Якби runtime створював нові тимчасові структури на кожному read/write:

- було б більше алокацій
- зростало б навантаження на GC
- hot path став би шумнішим

Тому stacks і epoch живуть у context.

## 10. State bits

У поточній реалізації використовуються:

- `Invalid`
- `Obsolete`
- `Tracking`
- `SideEffect`
- `Disposed`
- `Computing`
- `Scheduled`

### `Invalid`

Слабкий dirty hint.

Означає:

- "щось upstream могло змінитися"

Не означає:

- "вузол точно треба recompute"

### `Obsolete`

Підтверджена несвіжість через version check.

Означає:

- recompute справді потрібен

### `Tracking`

Прапор стабільності dependency set.

Він каже:

- минулий recompute не виявив shape churn

Він не каже:

- вузол свіжий

### `SideEffect`

Позначка effect node.

Потрібна, щоб invalidation path знав:

- цей вузол треба не лише позначити dirty
- його ще треба передати scheduler

### `Disposed`

Вузол більше не повинен брати участі в оновленнях.

### `Computing`

Тимчасовий guard від циклів / re-entrant recompute.

У dev mode цей прапор бере участь у safety checks.

### `Scheduled`

Ефект уже в черзі scheduler.

Потрібен для:

- dedupe без `Set`
- дешевого enqueue path

## 11. Node factories

У reflex є factories:

- `createSignalNode`
- `createComputedNode`
- `createEffectNode`

Вони корисні не лише заради краси.

Вони:

- централізують creation semantics
- не дають constructor details витекти по проєкту
- спрощують майбутні розширення

Це важливий архітектурний прийом:

якщо ядро мінімалістичне, точки створення особливо важливо тримати під контролем.
