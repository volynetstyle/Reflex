# Reflex Runtime v1.1: Execution Contexts Architecture
  (строгая модель графа)
+ (объяснимая реактивность)
+ (execution policies)
+ (низкий порог входа)
## Обзор

**Проблема:** Глобальный контекст должен быть полностью заменяемым без сталих рефренсов.

**Решение:** Только три функции для управления default context:

```typescript
getDefaultContext(): ExecutionContext      // получить текущий
setDefaultContext(ctx): ExecutionContext   // заменить (возвращает старый)
resetDefaultContext(hooks): ExecutionContext // сбросить на свежий
```

Никакого отдельного `runtime` экспорта — он только вводит в заблуждение.

## Quick Start

### 1. Инициализация в точке входа

```typescript
// main.ts
import { setDefaultContext, createExecutionContext } from "@reflex/runtime";

setDefaultContext(
  createExecutionContext({
    onEffectInvalidated(node) {
      queueMicrotask(() => runWatcher(node));
    },
    onReactiveSettled() {
      console.log("Batch completed");
    }
  })
);

// Теперь весь код может использовать API без явного контекста
```

### 2. Использование в приложении

```typescript
// Везде в коде:
import { writeProducer, readProducer } from "@reflex/runtime";

const signal = createProducer(1);

// Используется default context (установленный в main.ts)
writeProducer(signal, 42);
console.log(readProducer(signal));  // 42
```

### 3. Тестирование с изоляцией

```typescript
import { resetDefaultContext } from "@reflex/runtime";

describe("Tests", () => {
  beforeEach(() => {
    // Каждый тест имеет свежий default context
    resetDefaultContext();
  });

  it("should work", () => {
    // Чистая изоляция
  });
});
```

## Архитектура

### Default Context

```typescript
// При импорте создаётся автоматически
let defaultContext = new ExecutionContext();

// Функции используют его как значение по умолчанию
function writeProducer(node, value, context = getDefaultContext()) {
  // ...
}

// Host может заменить
const oldCtx = setDefaultContext(newContext);  // возвращает старый
```

### Ключевая особенность setDefaultContext

```typescript
export function setDefaultContext(
  context: ExecutionContext,
): ExecutionContext {
  const previous = defaultContext;
  defaultContext = context;
  return previous;  // ← возвращает старый для возможности восстановления
}
```

Это позволяет:
1. Сохранить старый контекст
2. Заменить на новый
3. Восстановить старый если нужно

```typescript
const oldCtx = setDefaultContext(newContext);
// ... использование newContext ...
setDefaultContext(oldCtx);  // восстановление
```

## API Reference

### Функции управления контекстом

```typescript
/**
 * Получить текущий default context.
 * Всегда возвращает актуальное значение, не сталь.
 */
function getDefaultContext(): ExecutionContext

/**
 * Заменить default context.
 * Возвращает старый для возможности восстановления.
 */
function setDefaultContext(context: ExecutionContext): ExecutionContext

/**
 * Сбросить default context на свежий с новыми hooks.
 * Полезно для тестов.
 */
function resetDefaultContext(hooks?: EngineHooks): ExecutionContext

/**
 * Создать новый независимый контекст.
 * Не становится default.
 */
function createExecutionContext(hooks?: EngineHooks): ExecutionContext
```

### Типы

```typescript
interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}

class ExecutionContext {
  activeComputed: ReactiveNode | null;
  propagationDepth: number;
  cleanupRegistrar: CleanupRegistrar | null;
  readonly hooks: EngineHooks;
  // ... методы ...
}
```

### API функции с контекстом

```typescript
// Все функции берут context лениво (не в сигнатуре):

function writeProducer<T>(
  node: ReactiveNode<T>,
  value: T,
  context?: ExecutionContext
): void
// если context не указан → context = getDefaultContext()

function readProducer<T>(
  node: ReactiveNode<T>,
  context?: ExecutionContext
): T

function readConsumer<T>(
  node: ReactiveNode<T>,
  mode?: ConsumerReadMode,
  context?: ExecutionContext
): T

function runWatcher(
  node: ReactiveNode,
  context?: ExecutionContext
): void

function untracked<T>(
  fn: () => T,
  context?: ExecutionContext
): T
```

## Примеры

### Пример 1: Простое приложение

```typescript
import {
  setDefaultContext,
  createExecutionContext,
  writeProducer,
  readProducer,
  runWatcher,
  type ExecutionContext,
  type ReactiveNode
} from "@reflex/runtime";

class SimpleReactiveApp {
  constructor(private context: ExecutionContext) {
    setDefaultContext(context);
  }

  createSignal<T>(initial: T): { get: () => T; set: (v: T) => void } {
    const node = createProducer(initial);
    return {
      get: () => readProducer(node),  // uses default context
      set: (v) => writeProducer(node, v)
    };
  }
}

// Инициализация
const app = new SimpleReactiveApp(
  createExecutionContext({
    onEffectInvalidated(node) {
      queueMicrotask(() => runWatcher(node));
    }
  })
);

// Использование
const count = app.createSignal(0);
count.set(42);
console.log(count.get());  // 42
```

### Пример 2: Микрофронтенды

```typescript
// bootstrap.ts
import { setDefaultContext, createExecutionContext } from "@reflex/runtime";

export function initializeApp(appId: string) {
  const context = createExecutionContext({
    onEffectInvalidated(node) {
      scheduleEffectFor(appId, node);
    },
    onReactiveSettled() {
      notifyAppSettled(appId);
    }
  });

  setDefaultContext(context);
  // Теперь все сигналы этого приложения используют свой контекст
}

// app1-main.ts
initializeApp("app1");
import("./app1").then(m => m.start());

// app2-main.ts  
initializeApp("app2");
import("./app2").then(m => m.start());

// Полная изоляция
```

### Пример 3: Context Stack для вложенности

```typescript
function withContext<T>(
  context: ExecutionContext,
  fn: () => T
): T {
  const previous = setDefaultContext(context);
  try {
    return fn();
  } finally {
    setDefaultContext(previous);
  }
}

// Использование
const ctx1 = createExecutionContext();
const ctx2 = createExecutionContext();

withContext(ctx1, () => {
  writeProducer(sig1, 1);  // ctx1
  
  withContext(ctx2, () => {
    writeProducer(sig2, 2);  // ctx2
  });
  
  writeProducer(sig1, 3);  // ctx1 again
});
```

### Пример 4: Custom Scheduler

```typescript
class CustomScheduler {
  private context: ExecutionContext;
  private pending = new Set<ReactiveNode>();
  private rafId: number | null = null;

  constructor() {
    this.context = createExecutionContext({
      onEffectInvalidated: (node) => this.schedule(node),
      onReactiveSettled: () => this.onSettled()
    });

    setDefaultContext(this.context);
  }

  private schedule(node: ReactiveNode) {
    this.pending.add(node);

    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.flush());
    }
  }

  private flush() {
    this.rafId = null;
    const toRun = Array.from(this.pending);
    this.pending.clear();

    for (const node of toRun) {
      runWatcher(node, this.context);
    }
  }

  private onSettled() {
    // Notified when batch is complete
    this.notifyUI();
  }

  private notifyUI() {
    // ...
  }
}

// Использование
const scheduler = new CustomScheduler();

// Все операции автоматически планируются
writeProducer(signal, value);  // будет выполнено на следующем RAF
```

## Почему без runtime экспорта?

### Проблема с `export const runtime = getDefaultContext()`

```typescript
// Плохо: сталь
const runtime = getDefaultContext();
setDefaultContext(newContext);

writeProducer(sig, 1);
// Какой контекст? старый (в runtime) или новый?
// Ответ: старый. Bug!
```

### Правильно: ленивый дефолт

```typescript
function writeProducer(
  node: ReactiveNode,
  value: unknown,
  context?: ExecutionContext
) {
  const ctx = context ?? getDefaultContext();  // всегда текущий!
  // ...
}

setDefaultContext(newContext);
writeProducer(sig, 1);  // гарантированно использует newContext
```

## Best Practices

### ✅ DO

- Инициализируйте default context в точке входа приложения
- Используйте `resetDefaultContext()` в `beforeEach` тестов
- Передавайте контекст явно в library code
- Создавайте изолированные контексты для микрофронтендов
- Используйте return value `setDefaultContext()` для восстановления

### ❌ DON'T

- Не импортируйте `runtime` как отдельный символ (его нет!)
- Не смешивайте контексты при создании зависимостей
- Не создавайте контексты для каждого узла
- Не полагайтесь на сталь из глобального экспорта

## Performance Notes

- Default context — O(1) allocation (~200 bytes)
- Parameter passing — zero-cost (compiler optimizes away)
- No graph rebuilding needed when changing default context
- Lazy context resolution at call site

## See Also

- [07-execution-contexts.md](./study/07-execution-contexts.md) — Подробная архитектура
- [06-effects-and-scheduler.md](./study/06-effects-and-scheduler.md) — Как работают эффекты
- [03-core-model.md](./study/03-core-model.md) — Реактивный граф


## Обзор

**Проблема v1.0:** Глобальный контекст загрязняется при смене scheduling policy.

**Решение v1.1:** 
- Default context создаётся и может быть заменён (`setDefaultContext()`)
- Старый default context уничтожается при замене
- Явные контексты могут создаваться независимо (`createExecutionContext()`)

## Quick Start

### 1. Инициализация в точке входа

```typescript
// main.ts
import { setDefaultContext, createExecutionContext } from "@reflex/runtime";

setDefaultContext(
  createExecutionContext({
    onEffectInvalidated(node) {
      queueMicrotask(() => runWatcher(node));
    },
    onReactiveSettled() {
      console.log("Batch completed");
    }
  })
);

// Теперь весь код может использовать API без явного контекста
```

### 2. Использование в приложении

```typescript
// Везде в коде:
import { writeProducer, readProducer } from "@reflex/runtime";

const signal = createProducer(1);

// Используется default context (установленный в main.ts)
writeProducer(signal, 42);
console.log(readProducer(signal));  // 42
```

### 3. Тестирование с изоляцией

```typescript
import { resetDefaultContext } from "@reflex/runtime";

describe("Tests", () => {
  beforeEach(() => {
    // Каждый тест имеет свежий default context
    resetDefaultContext();
  });

  it("should work", () => {
    // Чистая изоляция
  });
});
```

## Архитектура

### Default Context

```typescript
// При импорте создаётся автоматически
let defaultContext = new ExecutionContext();

// Функции используют его как значение по умолчанию
function writeProducer(node, value, context = defaultContext) {
  // ...
}

// Host может заменить
setDefaultContext(newContext);  // старый defaultContext брошен
```

### Управление контекстом

```typescript
// Получить текущий default
const ctx = getDefaultContext();

// Заменить на новый (старый уничтожается)
setDefaultContext(createExecutionContext(hooks));

// Сбросить на свежий (для тестов)
resetDefaultContext(hooks);
```

### Явные контексты

```typescript
// Создать независимый контекст (не становится default)
const isolatedCtx = createExecutionContext({
  onEffectInvalidated: myScheduler.schedule
});

// Явно передать
writeProducer(signal, value, isolatedCtx);
readProducer(signal, isolatedCtx);
```

## API Reference

### Типы

```typescript
interface EngineHooks {
  onEffectInvalidated?(node: ReactiveNode): void;
  onReactiveSettled?(): void;
}

class ExecutionContext {
  activeComputed: ReactiveNode | null;
  propagationDepth: number;
  cleanupRegistrar: CleanupRegistrar | null;
  readonly hooks: EngineHooks;
  
  // Методы...
}
```

### Функции управления контекстом

```typescript
// Создать новый контекст
function createExecutionContext(hooks?: EngineHooks): ExecutionContext

// Получить текущий default
function getDefaultContext(): ExecutionContext

// Заменить default (старый уничтожается)
function setDefaultContext(context: ExecutionContext): void

// Сбросить default на свежий
function resetDefaultContext(hooks?: EngineHooks): ExecutionContext
```

### API функции с контекстом

```typescript
// Все функции принимают context как последний параметр с default значением

writeProducer<T>(
  node: ReactiveNode<T>,
  value: T,
  context?: ExecutionContext
): void

readProducer<T>(
  node: ReactiveNode<T>,
  context?: ExecutionContext
): T

readConsumer<T>(
  node: ReactiveNode<T>,
  mode?: ConsumerReadMode,
  context?: ExecutionContext
): T

runWatcher(
  node: ReactiveNode,
  context?: ExecutionContext
): void

disposeWatcher(node: ReactiveNode): void

untracked<T>(
  fn: () => T,
  context?: ExecutionContext
): T
```

## Примеры

### Пример 1: Простое приложение

```typescript
// main.ts
import {
  setDefaultContext,
  createExecutionContext,
  writeProducer,
  readProducer,
  runWatcher,
  type ExecutionContext,
  type ReactiveNode
} from "@reflex/runtime";

class SimpleReactiveApp {
  constructor(private context: ExecutionContext) {
    setDefaultContext(context);
  }

  createSignal<T>(initial: T): { get: () => T; set: (v: T) => void } {
    const node = createProducer(initial);
    return {
      get: () => readProducer(node),  // использует default context
      set: (v) => writeProducer(node, v)  // использует default context
    };
  }
}

// Инициализация
const app = new SimpleReactiveApp(
  createExecutionContext({
    onEffectInvalidated(node) {
      queueMicrotask(() => runWatcher(node));
    }
  })
);

// Использование
const count = app.createSignal(0);
count.set(42);
console.log(count.get());  // 42
```

### Пример 2: Микрофронтенды

```typescript
// bootstrap.ts
import { setDefaultContext, createExecutionContext } from "@reflex/runtime";

export function initializeApp(appId: string) {
  const context = createExecutionContext({
    onEffectInvalidated(node) {
      scheduleEffectFor(appId, node);
    },
    onReactiveSettled() {
      notifyAppSettled(appId);
    }
  });

  setDefaultContext(context);
  // Теперь все сигналы этого приложения используют свой контекст
}

// app1-main.ts
initializeApp("app1");
import("./app1").then(m => m.start());

// app2-main.ts  
initializeApp("app2");
import("./app2").then(m => m.start());

// Полная изоляция
```

### Пример 3: WebWorker

```typescript
// worker.ts
import {
  setDefaultContext,
  createExecutionContext,
  writeProducer
} from "@reflex/runtime";

// Свой контекст для этого потока
setDefaultContext(
  createExecutionContext({
    onEffectInvalidated(node) {
      // Scheduling в контексте worker
    }
  })
);

// main.ts
const worker = new Worker("worker.js");

// Оба имеют независимые контексты
```

### Пример 4: Custom Scheduler

```typescript
class CustomScheduler {
  private context: ExecutionContext;
  private pending = new Set<ReactiveNode>();
  private rafId: number | null = null;

  constructor() {
    this.context = createExecutionContext({
      onEffectInvalidated: (node) => this.schedule(node),
      onReactiveSettled: () => this.onSettled()
    });

    setDefaultContext(this.context);
  }

  private schedule(node: ReactiveNode) {
    this.pending.add(node);

    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.flush());
    }
  }

  private flush() {
    this.rafId = null;
    const toRun = Array.from(this.pending);
    this.pending.clear();

    for (const node of toRun) {
      runWatcher(node, this.context);
    }
  }

  private onSettled() {
    // Notified when batch is complete
    this.notifyUI();
  }

  private notifyUI() {
    // ...
  }
}

// Использование
const scheduler = new CustomScheduler();

// Все операции автоматически планируются
writeProducer(signal, value);  // будет выполнено на следующем RAF
```

## Миграция с v1.0

### Было (v1.0)
```typescript
import { runtime } from "@reflex/runtime";

runtime.setHooks({
  onEffectInvalidated(node) { ... }
});

writeProducer(signal, value);
```

### Стало (v1.1)
```typescript
import { setDefaultContext, createExecutionContext, writeProducer } from "@reflex/runtime";

setDefaultContext(createExecutionContext({
  onEffectInvalidated(node) { ... }
}));

writeProducer(signal, value);  // ничего не изменилось!
```

**Или явно передавать контекст:**
```typescript
const ctx = createExecutionContext({...});
writeProducer(signal, value, ctx);
```

## Best Practices

### ✅ DO

- Инициализируйте default context в точке входа приложения
- Используйте `resetDefaultContext()` в `beforeEach` тестов
- Передавайте контекст явно в library code
- Создавайте изолированные контексты для микрофронтендов

### ❌ DON'T

- Не смешивайте контексты при создании зависимостей
- Не полагайтесь на глобальный контекст в library коде (явно передавайте)
- Не забывайте сбрасывать контекст между тестами
- Не создавайте контексты для каждого узла (используйте один на приложение)

## Performance Notes

- Default context — О(1) allocation (~200 bytes)
- Parameter passing — zero-cost (compiler optimizes away)
- No graph rebuilding needed when changing default context
- Old context is immediately GC'd if no references kept

## See Also

- [07-execution-contexts.md](./study/07-execution-contexts.md) — Подробная архитектура
- [06-effects-and-scheduler.md](./study/06-effects-and-scheduler.md) — Как работают эффекты
- [03-core-model.md](./study/03-core-model.md) — Реактивный граф
