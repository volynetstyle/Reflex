# Runtime Scheduler Contract

Reflex runtime hooks are notification points. They let a host scheduler observe
runtime events and enqueue work, but they must not synchronously execute reactive
work while the runtime is inside propagation, pulling, recomputing, or watcher
execution.

These checks are development-only. Production builds must keep the scheduler
contract at zero runtime cost.

## Allowed

### sinkInvalidatedDispatcher

```ts
queue.add(node);
```

```ts
scheduler.enqueue(node);
```

### reactiveSettledDispatcher

```ts
queueMicrotask(flush);
```

```ts
requestAnimationFrame(flush);
```

```ts
host.schedule(flush);
```

## Forbidden

### Do not run watchers synchronously

```ts
runWatcher(node);
```

### Do not read reactive graph state

```ts
readConsumer(node);
```

```ts
readProducer(node);
```

### Do not write reactive graph state

```ts
writeProducer(node, value);
```

### Do not flush effects synchronously

```ts
flushEffects();
```

This is forbidden when it immediately runs watchers from inside a runtime hook.

## Development Error Codes

`REFLEX_SCHEDULER_REENTRANT_FLUSH`

The host scheduler called `runWatcher(...)` synchronously from a runtime hook.

`REFLEX_SCHEDULER_REACTIVE_READ_IN_HOOK`

The host scheduler called `readProducer(...)` or `readConsumer(...)` from a
runtime hook.

`REFLEX_NESTED_PULL`

A reactive consumer attempted to start a pull walk while another pull walk was
already active.

`REFLEX_NESTED_PROPAGATION`

A producer write attempted to start propagation while another propagation walk
was already active.

`REFLEX_HOST_HOOK_REENTERED_RUNTIME`

A host hook returned after changing the runtime execution phase or depth.
