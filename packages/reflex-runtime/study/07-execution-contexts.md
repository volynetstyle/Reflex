# 07. Execution Contexts: Изолированные реактивные миры

## Принцип: Scheduling не наше дело + явные контексты

Согласно TC39 Signals proposal, scheduling (расписание выполнения эффектов) — это **userland concern**.
Runtime предоставляет только механизмы отслеживания и уведомлений, всё остальное — на host.

**Важное изменение v1.1:** Нет отдельного `runtime` экспорта. Только явные функции.

## 1. Что такое ExecutionContext?

`ExecutionContext` — это объект состояния вычисления, который отслеживает:

```typescript
class ExecutionContext {
  // Текущий узел в процессе вычисления (для trackRead)
  activeComputed: ReactiveNode | null = null;

  // Глубина каскада инвалидаций (для onReactiveSettled)
  propagationDepth = 0;

  // Registrar для cleanup функций в эффектах
  cleanupRegistrar: CleanupRegistrar | null = null;

  // Callback hooks, которые host настраивает
  readonly hooks: EngineHooks;
}
```

## 2. Управление Default Context

Runtime имеет **default context**, который:

- Создаётся при первом импорте
- Заменяется при вызове `setDefaultContext()`
- **Никогда не экспортируется** как отдельный символ (чтобы избежать сталей)

Три функции для управления:

```typescript
getDefaultContext(): ExecutionContext        // получить текущий
setDefaultContext(ctx): ExecutionContext     // заменить, вернуть старый
resetDefaultContext(hooks): ExecutionContext // сбросить на свежий
```

Старая архитектура (v1.0):

```typescript
// Один глобальный контекст на приложение
const runtime = new ExecutionContext();

function readProducer(node) {
  trackRead(node);  // <- использовал глобальный runtime
  return node.payload;
}
```

Новая архитектура (v1.1):

```typescript
// Default context + explicit contexts
let defaultContext = new ExecutionContext();

function readProducer(node, context = defaultContext) {
  trackRead(node, context);
  return node.payload;
}

// Host может заменить default
setDefaultContext(newContext);

// Или создать изолированный
const isolatedCtx = createExecutionContext();
readProducer(node, isolatedCtx);
```

## 4. API для управления контекстом

### `createExecutionContext(hooks?)`

Создаёт новый изолированный контекст:

```typescript
const ctx = createExecutionContext({
  onEffectInvalidated(node) {
    scheduler.schedule(node);
  }
});

writeProducer(signal, value, ctx);
```

### `getDefaultContext()`

Получить текущий default контекст:

```typescript
const ctx = getDefaultContext();
// Используется во всех функциях, если контекст не указан
```

### `setDefaultContext(context)`

Заменить default контекст **на новый**. Старый будет брошен:

```typescript
const newCtx = createExecutionContext({
  onEffectInvalidated: myScheduler.schedule
});

setDefaultContext(newCtx);

// Теперь все функции без явного context будут использовать newCtx
writeProducer(signal, value);  // использует newCtx, а не старый
```

### `resetDefaultContext(hooks?)`

Сбросить default контекст на свежий (полезно для тестов):

```typescript
beforeEach(() => {
  resetDefaultContext({
    onEffectInvalidated(node) { /* ... */ }
  });
});
```

## 5. Практические сценарии

### Сценарий 1: Однопоточное приложение (большинство случаев)

```typescript
import { setDefaultContext, createExecutionContext } from "@reflex/runtime";

// Инициализируем в main.ts
setDefaultContext(
  createExecutionContext({
    onEffectInvalidated(node) {
      queueMicrotask(() => runWatcher(node));
    }
  })
);

// Везде в приложении можно использовать без явного контекста
writeProducer(signal, value);  // ✅ использует default context
readConsumer(computed);         // ✅ использует default context
runWatcher(effect);             // ✅ использует default context
```

### Сценарий 2: Микрофронтенды (изолированные приложения)

```typescript
// app1.ts
const app1Context = createExecutionContext({
  onEffectInvalidated: app1Scheduler.schedule
});
setDefaultContext(app1Context);
// Теперь app1 использует свой контекст

// app2.ts
const app2Context = createExecutionContext({
  onEffectInvalidated: app2Scheduler.schedule
});
setDefaultContext(app2Context);
// Теперь app2 использует свой контекст (app1Context брошен)
```

### Сценарий 3: Тестирование с изоляцией

```typescript
import { resetDefaultContext } from "@reflex/runtime";

describe("Signal tests", () => {
  beforeEach(() => {
    // Каждый тест начинает со свежего контекста
    resetDefaultContext();
  });

  it("should work", () => {
    const signal = createProducer(1);
    writeProducer(signal, 2);
    expect(readProducer(signal)).toBe(2);
  });
});
```

### Сценарий 4: WebWorkers (многопоточность)

```typescript
// main.ts
const mainContext = createExecutionContext({ /* ... */ });
setDefaultContext(mainContext);

// worker.ts (другой контекст, другой поток)
const workerContext = createExecutionContext({ /* ... */ });
setDefaultContext(workerContext);

// Полностью изолированы
```

### Сценарий 5: Явное управление несколькими контекстами

```typescript
const ctx1 = createExecutionContext({ /* policy 1 */ });
const ctx2 = createExecutionContext({ /* policy 2 */ });

// Вручную выбираем какой использовать
if (condition) {
  writeProducer(signal, value, ctx1);
} else {
  writeProducer(signal, value, ctx2);
}
```

## 6. Использование API с контекстом

Все функции принимают контекст последним параметром:

```typescript
// Явно передать контекст
writeProducer(signal, value, ctx);
readProducer(signal, ctx);
readConsumer(computed, mode, ctx);
runWatcher(effect, ctx);

// Или использовать default (если он установлен)
writeProducer(signal, value);  // = writeProducer(signal, value, getDefaultContext())
readProducer(signal);          // = readProducer(signal, getDefaultContext())
```

## 7. Правила и инварианты

✅ **Default context** создаётся при первом импорте  
✅ `setDefaultContext(new)` **уничтожает** старый default context  
✅ Явно созданные контексты (`createExecutionContext()`) никогда не становятся default  
✅ Контекст — это просто объект состояния, вы можете передать один и тот же контекст разным частям кода  
✅ Один контекст может служить множественным реактивным узлам одновременно  

❌ Не смешивайте контексты при создании зависимостей:

```typescript
// Плохо: разные контексты для зависимого и зависимости
const signal = new ReactiveNode(1);
const computed = new ReactiveNode(
  () => readProducer(signal, ctx1),
  ...
);

writeProducer(signal, 2, ctx2);  // ❌ может привести к несогласованности
```

## 8. Миграция старого кода

**Было (v1.0):**
```typescript
import { runtime } from "@reflex/runtime";

runtime.setHooks({ onEffectInvalidated: ... });
writeProducer(signal, value);
```

**Стало (v1.1):**
```typescript
import { setDefaultContext, createExecutionContext } from "@reflex/runtime";

setDefaultContext(createExecutionContext({
  onEffectInvalidated: ...
}));

writeProducer(signal, value);  // использует новый default context
```

## 9. Performance и Memory

- ✅ Default context — лёгкий объект (~200 bytes)
- ✅ Parameter passing — zero-cost (default value)
- ✅ `setDefaultContext()` не требует перестройки графа
- ✅ Старый default context сразу GC'ится если нет на него ссылок

## 10. Когда использовать какой подход?

| Сценарий | Подход | Пример |
|----------|--------|---------|
| Однопоточное приложение | Используй default context | App, SPA, MPA |
| Микрофронтенды | `setDefaultContext()` per app | Module federation |
| WebWorkers | Свой default на поток | Background tasks |
| Тестирование | `resetDefaultContext()` | beforeEach в тестах |
| Разные scheduler policies | Явно передавать контекст | Custom scheduling |
| Полная изоляция | `createExecutionContext()` | Library code |

---

**Итог:** Default context + explicit API гарантирует, что:
1. Старый код работает без изменений (backward compatible)
2. Новый код может легко создавать изолированные миры
3. State никогда не "загрязняется" случайно при смене контекста

## 2. Откуда взялось?

Старая архитектура:

```typescript
// Глобальный контекст (был в старой версии)
const runtime = new ExecutionContext();

// Все функции использовали его неявно
function readProducer(node) {
  trackRead(node);  // <- trackRead(node) использовал глобальный runtime
  return node.payload;
}
```

Новая архитектура:

```typescript
// Контекст явно передаётся как параметр
function readProducer(node, context = runtime) {
  trackRead(node, context);  // <- контекст явно пробрасывается
  return node.payload;
}

// Host может создавать изолированные контексты
const ctx1 = createExecutionContext();
const ctx2 = createExecutionContext();

readProducer(node1, ctx1);  // один мир
readProducer(node2, ctx2);  // другой мир
```

## 3. Создание и использование контекстов

### Простой пример: глобальный контекст (как было раньше)

```typescript
import { runtime, writeProducer, readConsumer, runWatcher } from "@reflex/runtime";

// Подключаем hooks в глобальный контекст
const pending: ReactiveNode[] = [];

runtime.setHooks({
  onEffectInvalidated(node) {
    pending.push(node);
  },
  onReactiveSettled() {
    console.log("Реактивная работа завершена");
  }
});

// Используем без явного контекста (по умолчанию runtime)
writeProducer(source, newValue);  // context = runtime
runWatcher(effect);                // context = runtime
```

### Изолированные контексты

```typescript
import { createExecutionContext, writeProducer } from "@reflex/runtime";

// Создаём два независимых контекста
const context1 = createExecutionContext({
  onEffectInvalidated(node) {
    console.log("Context 1: инвалиден", node);
  }
});

const context2 = createExecutionContext({
  onEffectInvalidated(node) {
    console.log("Context 2: инвалиден", node);
  }
});

// Одно значение изменится в контексте 1
writeProducer(node, value1, context1);

// Другое — в контексте 2 (независимо)
writeProducer(node, value2, context2);
```

## 4. API функций с контекстом

Все API функции теперь принимают контекст последним параметром с default значением:

```typescript
// Сигналы (producers)
writeProducer(node: ReactiveNode<T>, value: T, context?: ExecutionContext)

// Читатели (consumers)
readProducer(node: ReactiveNode<T>, context?: ExecutionContext)
readConsumer(node: ReactiveNode<T>, mode?: ConsumerReadMode, context?: ExecutionContext)

// Эффекты (watchers)
runWatcher(node: ReactiveNode, context?: ExecutionContext)

// Утилиты
untracked(fn: () => T, context?: ExecutionContext)
```

Пример использования:

```typescript
const ctx = createExecutionContext();

// Все функции приняли контекст
const value = readProducer(source, ctx);
writeProducer(target, value, ctx);
readConsumer(computed, ConsumerReadMode.eager, ctx);
runWatcher(effect, ctx);
```

## 5. Обратная совместимость

**Глобальный `runtime` остаётся для обратной совместимости:**

```typescript
import { runtime } from "@reflex/runtime";

// Это работает (использует глобальный контекст)
readProducer(node);
writeProducer(node, value);
runWatcher(effect);
```

Но в новом коде рекомендуется явно создавать контексты:

```typescript
import { createExecutionContext } from "@reflex/runtime";

const myContext = createExecutionContext();
// ... передавайте myContext везде
```

## 6. Сценарий: микрофронтенды / изолированные приложения

```typescript
// app1.ts
const app1Context = createExecutionContext({
  onEffectInvalidated(node) {
    scheduleEffectFor(app1, node);
  },
  onReactiveSettled() {
    flushEffectsFor(app1);
  }
});

function createSignal(initial) {
  const node = new ReactiveNode(initial, null, PRODUCER_INITIAL_STATE);
  return {
    get: (ctx = app1Context) => readProducer(node, ctx),
    set: (val, ctx = app1Context) => writeProducer(node, val, ctx)
  };
}

// app2.ts
const app2Context = createExecutionContext({
  onEffectInvalidated(node) {
    scheduleEffectFor(app2, node);
  }
});

// Две app полностью изолированы
const signal1 = app1.createSignal(1);
const signal2 = app2.createSignal(2);

signal1.set(10);  // влияет только на app1
signal2.set(20);  // влияет только на app2
```

## 7. Сценарий: кастомный scheduler

Host может полностью контролировать scheduling через контекст:

```typescript
class CustomScheduler {
  context: ExecutionContext;
  pending: Set<ReactiveNode> = new Set();
  flushScheduled = false;

  constructor() {
    this.context = createExecutionContext({
      onEffectInvalidated: (node) => this.scheduleEffect(node),
      onReactiveSettled: () => this.onSettled()
    });
  }

  scheduleEffect(node: ReactiveNode) {
    this.pending.add(node);
    this.scheduleFlushing();
  }

  scheduleFlushing() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    
    // Используем любую scheduling стратегию
    requestIdleCallback(() => this.flush());
  }

  flush() {
    this.flushScheduled = false;
    const toRun = Array.from(this.pending);
    this.pending.clear();
    
    for (const node of toRun) {
      runWatcher(node, this.context);
    }
  }

  onSettled() {
    // Можно логировать, обновлять UI и т.д.
    console.log("Batch completed");
  }

  // API для пользователя
  writeSignal(node, value) {
    writeProducer(node, value, this.context);
  }
}
```

## 8. Ключевые инварианты

✅ Контекст изолирует `activeComputed` (для trackRead)  
✅ Контекст изолирует `propagationDepth` (для onReactiveSettled)  
✅ Контекст изолирует hooks (для scheduling)  
✅ Контекст НЕ изолирует сами реактивные узлы (ReactiveNode)  

**Последний пункт важен:** разные контексты могут читать и писать одни и те же узлы, просто с разным scheduling.

## 9. Когда использовать один контекст, а когда несколько?

**Один контекст (обычное приложение):**
```typescript
const ctx = createExecutionContext({ /* scheduling policy */ });
// Все сигналы, computed, effects используют ctx
```

**Несколько контекстов (микрофронтенды, WebWorkers, тесты):**
```typescript
const ctx1 = createExecutionContext({ /* policy 1 */ });
const ctx2 = createExecutionContext({ /* policy 2 */ });
// Разные части системы используют разные контексты
```

## 10. Миграция старого кода

Если у вас был код с глобальным `runtime`:

```typescript
// Старый код
import { runtime, writeProducer } from "@reflex/runtime";

runtime.setHooks({ onEffectInvalidated: ... });
writeProducer(node, value);
```

Переходите на:

```typescript
// Новый код
import { createExecutionContext, writeProducer } from "@reflex/runtime";

const ctx = createExecutionContext({ 
  onEffectInvalidated: ... 
});
writeProducer(node, value, ctx);
```

## 11. Практический пример: простой reactive store

```typescript
import {
  createExecutionContext,
  createNode,
  readProducer,
  writeProducer,
  ReactiveNodeState
} from "@reflex/runtime";

class Store {
  private ctx: ExecutionContext;
  private signals = new Map();

  constructor() {
    this.ctx = createExecutionContext({
      onEffectInvalidated: (node) => {
        // Defer updates
        queueMicrotask(() => this.flush());
      }
    });
  }

  createSignal(id: string, initial: unknown) {
    const node = new ReactiveNode(initial, null, PRODUCER_INITIAL_STATE);
    this.signals.set(id, node);
    return id;
  }

  get(id: string) {
    const node = this.signals.get(id);
    return readProducer(node, this.ctx);
  }

  set(id: string, value: unknown) {
    const node = this.signals.get(id);
    writeProducer(node, value, this.ctx);
  }

  private flush() {
    // Host выполнил нужные действия после settled
  }
}
```

---

**Итог:** ExecutionContext отделяет tracking логику от scheduling логики. Runtime остаётся минималистичным, а весь scheduling полностью в руках host.
