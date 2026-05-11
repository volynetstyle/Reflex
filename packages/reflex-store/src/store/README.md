# Experimental compiled store

This directory is an isolated experiment for a compile-time store syntax that
lowers into canonical Reflex runtime primitives.

## Goal

Allow author code like:

```ts
const state = createStore({
  user: { name: "Alice" },
  count: 0,
});

state.user.name = "Bob";
state.count++;
```

while compiling it to a lower-level form based on `createModel(...)`,
`signal(...)`, and precomputed action-wrapped writers.

## Semantic core: phase 1

Supported:

- static fields
- fixed nested paths
- static dot access only
- leaf reads like `state.user.name`
- assignments like `state.user.name = "Bob"`
- update operators like `state.count++`, `++state.count`, `state.count += 1`

Out of scope:

- dynamic keys
- spread/rest
- reflection guarantees
- aliasing nested branches
- optional chaining
- runtime schema walking

## Lowering direction

The intended canonical lowering target is:

```ts
const state = createModel((ctx) => {
  const [__user_name, __set_user_name] = signal("Alice");
  const [__count, __set_count] = signal(0);

  const __write_user_name = ctx.action((value: string) => {
    __set_user_name(value);
    return value;
  });

  const __write_count = ctx.action((value: number) => {
    __set_count(value);
    return value;
  });

  return {
    user: {
      get name() {
        return __user_name();
      },
      set name(value) {
        __write_user_name(value);
      },
    },
    get count() {
      return __count();
    },
    set count(value) {
      __write_count(value);
    },
  };
})();
```

Hot-path optimization is expected to lower direct reads and writes further to
the generated accessors/writers:

- `state.user.name` -> `__user_name()`
- `state.user.name = "Bob"` -> `__write_user_name("Bob")`
- `state.count++` -> temp-based read/modify/write lowering

## Runtime contract

`createStore(...)` in this folder is intentionally a compile-only stub. If it
executes at runtime, the transform was not applied.
