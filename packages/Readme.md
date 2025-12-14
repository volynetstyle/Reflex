## Philosophy

Reflex is not just a UI library.
It is a **reactive runtime** with a clear separation between:

- **Contracts** – what must hold (laws, invariants, interfaces)
- **Core** – how reactivity is described (signals, ownership, graph)
- **Runtime** – how the system _lives in time_ (scheduler, epochs, execution modes)
- **Adapters** – how this world is projected onto concrete platforms (DOM, etc.)

> **Important:** `@reflex/core` is _declarative and time-agnostic_
> It does **not** know about time, schedulers, threads, async APIs, or side effects.
> It only expresses structure, dependencies, and ownership.

This separation lets Reflex operate in three distinct modes:

- **Library mode** — ergonomic reactive primitives (`signals`, `effects`, `batch`).
- **Framework mode** — customizable runtime policies (scheduling strategies, execution models).
- **Research mode** — swap/extend contracts, causality models, and memory/scheduling semantics.

The public API remains simple:

```ts
import { createSignal, createEffect } from "reflex";
```

while the internal layers remain explicit, swappable, and formally defined.

---

## Architecture Diagram (ASCII / dependency chain)

```text
                @reflex/contract
                        ▲
                        │
                @reflex/runtime
                        ▲
                        │
@reflex/core ◄──────── reflex (public API)
                        ▲
                        │
                  reflex-dom (adapter)
```

**How to read this:**

- `@reflex/contract` — formal laws and interfaces (no behavior)
- `@reflex/runtime` — binds time, scheduling, policies to the system
- `@reflex/core` — implements reactive dataflow & ownership (no time, no effects)
- `reflex` — curated public API / facade
- `reflex-dom` — platform adapter (DOM projection)

In practice:

- `reflex` re-exports stable, safe parts of `@reflex/core` and `@reflex/runtime`
- `reflex-dom` depends on `reflex`, not on internals
- Power users and contributors may use `@reflex/*` directly

---

## Architecture Diagram (SVG)

_(Same semantics, visualized)_
![alt text](/assets/reflex-arch.svg)
