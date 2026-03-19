# 06. Effects і scheduler: як побічні реакції винесені поверх ядра

`computed` і `effect` схожі тим, що обидва запускають `compute`.

Але семантично це різні речі.

## 1. Чим effect відрізняється від computed

`computed` потрібен, щоб повернути значення.

`effect` потрібен, щоб виконати код.

Приклад:

```ts
rt.effect(() => {
  console.log(count.read());
});
```

Тут значення `effect` нікому не потрібне.
Потрібен сам побічний результат.

## 2. Чому effect не можна просто зробити "ще одним computed"

Тому що у effect є окремі вимоги:

- cleanup
- scheduling
- dispose
- можливий eager/manual flush режим

Якщо змішати все це з semantics `computed`, ядро швидко розпухне.

Тому reflex робить так:

- graph і execution pipeline максимально спільні
- scheduling effects винесений в окремий шар

## 3. Lifecycle effect

Під час створення effect:

1. створюється effect node
2. effect запускається одразу
3. під час виконання трекає залежності
4. може повернути cleanup

Під час invalidation:

1. node отримує `Invalid`
2. runtime бачить, що це `Effect`
3. effect передається scheduler

Під час flush/eager execution:

1. scheduler дістає effect
2. якщо effect ще dirty і не disposed, він запускається
3. попередній cleanup викликається перед новим run

## 4. Чому scheduler винесений окремо

Це важливо архітектурно.

Є дві різні задачі:

### Invalidation

Сказати:

"цей effect треба потім виконати"

### Scheduling

Вирішити:

- коли саме його запускати
- одразу чи потім
- як dedupe чергу

Якщо ці задачі живуть в одному місці:

- runtime важче розширювати
- eager/flush mode виходить брудним
- invalidation path тягне на собі зайву відповідальність

У reflex це розділено через boundary:

- graph invalidation викликає hook
- scheduler вирішує, що робити далі

## 5. `EffectScheduler`

Поточний scheduler deliberately маленький.

Він зберігає:

- `queue: ReactiveNode[]`
- `head`
- `flushing`
- `mode`

### Чому не `shift()`

Тому що `shift()` зсуває масив і гірше підходить для hot path.

Замість цього:

- елементи кладуться в масив
- читання йде через `head`
- після flush черга скидається цілком

Це дешевше й простіше.

### Чому не `Set`

Тому що dedupe зроблено через state bit `Scheduled`.

Це означає:

- менше структури
- менше hash/bookkeeping
- дешевший enqueue path

## 6. `Scheduled` bit

Коли effect ставиться в чергу:

- виставляється `Scheduled`

Коли scheduler знімає його з черги:

- `Scheduled` очищається

Це робить dedupe простим:

```ts
if (isScheduledState(node.state)) return;
```

Без `Set`, без lookup по об'єкту в окремій структурі.

## 7. Стратегії: `flush` і `eager`

### `flush`

Це дефолт.

Поведінка:

- writes лише enqueue effect
- реальний запуск - через `rt.flush()`

Підходить коли:

- треба контролювати момент side effects
- хочеться відділити mutation phase від effect phase

### `eager`

Поведінка:

- enqueue effect
- scheduler намагається flush одразу

Це вже крок у бік eager execution, але не переписування ядра.

І це дуже важливий архітектурний принцип reflex:

eager mode має бути шаром поверх lazy core, а не заміною lazy core.

## 8. Cleanup

Effect може повернути cleanup:

```ts
rt.effect(() => {
  subscribe();
  return () => unsubscribe();
});
```

Під час повторного запуску:

1. старий cleanup викликається
2. payload очищається
3. effect compute запускається знову
4. новий cleanup зберігається

Під час dispose:

1. ставиться `Disposed`
2. cleanup викликається
3. inbound sources unlink

## 9. Чому scheduler не чіпає computed

Тому що `computed` залишаються pure lazy вузлами.

Це принципово:

- scheduler відповідає лише за effect execution policy
- freshness `computed` як і раніше визначається read path

Саме так можна розширювати runtime без втрати мінімалізму.

## 10. Що можна додати в майбутньому

На базі цього шару відносно природно будуються:

- microtask scheduler
- custom host scheduler
- priority queues
- separate eager flush API
- topo-based effect execution

Але важливо:

кожне таке розширення має залишати lazy core незмінним по суті.
