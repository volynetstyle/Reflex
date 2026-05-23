# Compiled Store Transform Spec

This document defines phase-1 transform rules for the experimental
`createStore(...)` API in [`./createStore.ts`](./createStore.ts).

The goal is to support a zero-proxy production path by treating `createStore`
as compile-time syntax sugar that lowers to canonical Reflex runtime
primitives.

## Scope

The transform applies only to stores declared directly from a static object
literal:

```ts
const state = createStore({
  user: { name: "Alice" },
  count: 0,
});
```

Phase-1 constraints:

- only plain object literals
- only statically known nested paths
- only static dot access on the store root
- no dynamic keys
- no spread/rest guarantees
- no reflection guarantees
- no aliasing guarantees for nested branches
- no optional chaining support

## Canonical lowering target

The intended runtime target is:

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

Hot-path optimization may lower direct operations further:

- `state.user.name` -> `__user_name()`
- `state.user.name = "Bob"` -> `__write_user_name("Bob")`
- `state.count++` -> temp-based read/modify/write lowering

## Store model

For each leaf path the transform materializes:

- a read accessor id: `__read_<mangled_path>`
- a write action id: `__write_<mangled_path>`

Examples:

- `user.name` -> `__read_user_name`, `__write_user_name`
- `count` -> `__read_count`, `__write_count`

The draft transform currently emits read calls such as `__read_count()` and
write calls such as `__write_count(value)`.

## Rule 1: read member access

Supported input:

```ts
state.user.name
state.count
foo(state.user.name)
```

Match conditions:

- root identifier is a known compiled store binding
- access chain is static dot access
- full chain resolves to a known leaf path
- expression is not being handled as an assignment/update target

Lowering:

```ts
state.user.name -> __read_user_name()
state.count -> __read_count()
foo(state.user.name) -> foo(__read_user_name())
```

Unsupported in phase 1:

```ts
state.user
state["user"]
state[key]
const user = state.user
user.name
```

## Rule 2: assignment

Supported input:

```ts
state.user.name = "Bob"
state.count = count + 1
```

Match conditions:

- left side resolves to a known writable leaf path
- operator is assignment-compatible

### Plain assignment

Lowering:

```ts
state.user.name = "Bob" -> __write_user_name("Bob")
state.count = next -> __write_count(next)
```

The writer is expected to return the committed value so expression semantics can
be preserved:

```ts
const next = (state.count = 5) -> const next = __write_count(5)
```

### Compound assignment

Supported in phase 1:

- `+=`
- `-=`

Lowering must:

- read once
- evaluate RHS once
- write once
- return the new value

Example:

```ts
state.count += 2
```

becomes:

```ts
(() => {
  const __rhs = 2;
  const __next = __read_count() + __rhs;
  __write_count(__next);
  return __next;
})()
```

## Rule 3: update operators

Supported input:

- `state.count++`
- `state.count--`
- `++state.count`
- `--state.count`

Match conditions:

- operand resolves to a known numeric leaf path

### Postfix

Must preserve JS semantics:

- read current value once
- write updated value once
- return previous value

Example:

```ts
state.count++
```

becomes:

```ts
(() => {
  const __prev = __read_count();
  __write_count(__prev + 1);
  return __prev;
})()
```

### Prefix

Must preserve JS semantics:

- read current value once
- write updated value once
- return next value

Example:

```ts
++state.count
```

becomes:

```ts
(() => {
  const __next = __read_count() + 1;
  __write_count(__next);
  return __next;
})()
```

## Evaluation guarantees

The transform must preserve:

- JS evaluation order
- single evaluation of RHS expressions
- postfix vs prefix return semantics
- single read and single write per update operation

For phase 1 the recommended shape is a temp-based IIFE or an equivalent
single-evaluation block expression.

## Unsupported constructs

The transform should reject or skip:

- `state[key]`
- `state.user[key]`
- `delete state.count`
- `'count' in state`
- `Object.keys(state)`
- `{ ...state }`
- `const { count } = state`
- `const branch = state.user; branch.name = "Bob"`
- `state.user?.name`

## Diagnostics

Recommended diagnostics:

- `Dynamic compiled-store access is not supported in phase 1.`
- `Aliasing nested compiled-store branches is not supported in phase 1.`
- `Spread and reflection are not guaranteed for compiled stores in phase 1.`

## Notes on the draft transform

The adjacent [`./transform.ts`](./transform.ts) file is intentionally a draft:

- it recognizes `createStore({ ... })` declarations
- it rewrites read member access to generated accessor calls
- it rewrites `=`, `+=`, `-=`, `++`, and `--`
- it emits accessor names rather than the full `createModel(...)` lowering

That draft is meant to validate path matching and expression semantics before
the full runtime-lowering stage is introduced.
