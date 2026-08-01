# Runtime Scheduler Contract

Reflex has two runtime hook boundaries. A host scheduler observes invalidated
sinks during propagation, then receives a settled notification once the runtime
is idle. Only the latter is a synchronous execution boundary.

These checks are development-only. Production builds must keep the scheduler
contract at zero runtime cost.

## Allowed

### onNodeInvalidated

```ts
queue.add(node);
```

```ts
scheduler.enqueue(node);
```

This hook is enqueue-only. It must return before a watcher runs or reactive
graph state is read.

### onRuntimeIdle

```ts
queueMicrotask(flush);
```

```ts
requestAnimationFrame(flush);
```

```ts
host.schedule(flush);
```

```ts
flush(); // may synchronously call runWatcher for queued work
```

`onRuntimeIdle` runs when propagation, pull, and watcher work are
idle. A synchronous drain may read or write reactive state through its watchers.
If it creates more work, the runtime emits a new settled checkpoint after it is
idle again.

Nested runtime hook calls are valid. The runtime restores the enclosing hook's
validation context when an inner hook returns.

## Forbidden from `onNodeInvalidated`

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

### Do not dispose watchers

```ts
disposeWatcher(node);
```

### Do not flush effects synchronously

```ts
flushEffects();
```

This is forbidden when it immediately runs watchers from the invalidation hook.

## Development Error Codes

`REFLEX_SCHEDULER_REENTRANT_FLUSH`

The host scheduler called `runWatcher(...)` synchronously from
`onNodeInvalidated`.

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

## Hook exceptions

If a host hook throws during propagation, Reflex clears the active propagation
walk and rethrows the original error. The host may catch that error; the next
producer write starts from a clean propagation state.
