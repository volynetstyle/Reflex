# 02. Публічний API: як reflex виглядає зовні

Головний вхід - `createRuntime()`.

## 1. Створення runtime

```ts
import { createRuntime } from "reflex";

const rt = createRuntime();
```

Зараз runtime підтримує опції:

```ts
const rt = createRuntime({
  effectStrategy: "flush",
});
```

або:

```ts
const rt = createRuntime({
  effectStrategy: "eager",
});
```

### `effectStrategy`

- `"flush"`: effect після invalidation лише ставиться в чергу
- `"eager"`: effect намагається виконатися одразу через scheduler

За замовчуванням використовується `"flush"`.

## 2. `signal`

```ts
const count = rt.signal(0);
```

Методи:

```ts
count.read();
count.write(10);
```

Сенс:

- `read()` повертає поточне значення
- `write(value)` оновлює signal і інвалідує downstream

Важливо:

- same-value write через `Object.is` нічого не робить
- запис не перераховує downstream

## 3. `computed`

```ts
const double = rt.computed(() => count.read() * 2);
```

`computed` у reflex викликається як функція:

```ts
double();
```

Особливості:

- це lazy значення
- до першого читання може взагалі не обчислюватися
- результат кешується
- залежності трекаються динамічно під час виконання

## 4. `memo`

```ts
const total = rt.memo(() => price.read() + tax.read());
```

`memo` - це просто eager-first-read версія `computed`.

Тобто:

- створюється computed
- потім одразу викликається один раз

Практичний сенс:

- зручно, коли хочеться одразу прогріти кеш
- корисно в деяких benchmark / setup сценаріях

## 5. `effect`

```ts
const scope = rt.effect(() => {
  console.log(count.read());
});
```

`effect`:

- виконується одразу при створенні
- трекає залежності
- при invalidation буде поставлений у scheduler
- може повернути cleanup-функцію

Приклад:

```ts
const scope = rt.effect(() => {
  const id = setInterval(() => {
    console.log(count.read());
  }, 1000);

  return () => clearInterval(id);
});
```

## 6. `flush()`

```ts
rt.flush();
```

Це ручний прогін черги ефектів.

Коли він потрібен:

- при `effectStrategy: "flush"`
- коли хочете явно відділити writes від effect execution

Коли він не потрібен:

- для звичайних `computed`
- в eager effect strategy після простих invalidations

## 7. `batchWrite()`

```ts
rt.batchWrite([
  [price, 120],
  [tax, 25],
]);
```

Сенс:

- усі writes отримують один і той самий epoch
- downstream інвалідується після кожного source update
- recompute, як і раніше, не робиться на write path

Важливо розуміти:

- це batching writes
- це не eager flush графа

## 8. `ctx`

```ts
rt.ctx
```

Це внутрішній runtime context.

Ззовні він доступний, але це низькорівнева частина.
Звичайний користувач API майже ніколи не повинен на нього спиратися.

Він потрібен:

- для тестів
- для внутрішньої інтеграції
- для відлагодження runtime

## 9. Мінімальний робочий приклад

```ts
const rt = createRuntime();

const a = rt.signal(1);
const b = rt.signal(2);

const sum = rt.computed(() => a.read() + b.read());

console.log(sum()); // 3

a.write(10);

console.log(sum()); // 12
```

Що сталося:

1. під час першого `sum()` побудувалися залежності
2. при `a.write(10)` `sum` став `Invalid`
3. під час другого `sum()` runtime перевірив freshness і перерахував значення

## 10. Типова помилка мислення

Новачки часто думають так:

"якщо dependency змінилася, значить весь downstream зобов'язаний негайно recompute"

Для reflex це неправильно.

Правильно так:

"якщо dependency змінилася, downstream треба перевірити під час наступного читання"

Це маленька, але фундаментальна різниця.
