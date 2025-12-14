# @reflex/eslint-plugin-forbidden-imports

> Prevents direct usage of internal `@reflex/*` packages outside the Reflex core.

This ESLint plugin enforces **architectural boundaries** of the Reflex ecosystem by forbidding imports from internal packages (`@reflex/*`) in application-level code.

It is designed as a **soft but strict guardrail** that:

- Keeps the public API clean (`reflex`, `reflex-dom`)
- Prevents accidental coupling with internals
- Preserves architectural discipline
- Supports layered system design

If you want advanced access – you should **know exactly why** you need it.

---

## 🚫 What is forbidden?

```ts
import { createSignal } from "@reflex/core"; // ❌ forbidden
import { createUniverse } from "@reflex/runtime"; // ❌ forbidden
import type { IOwner } from "@reflex/contract"; // ❌ forbidden
```

Allowed usage:

```ts
import { createSignal } from "reflex"; // ✅ OK
import { render } from "reflex-dom"; // ✅ OK
```

Imports from `@reflex/*` are allowed **only** inside Reflex internal packages:

- `packages/@reflex/**`
- `packages/reflex/**`
- `plugins/**`
- `theory/**`

Everywhere else — blocked.

---

## 📦 Installation

From the root of your monorepo:

```bash
pnpm add -D ./plugins/forbidden-imports
```

Or when published:

```bash
pnpm add -D @reflex/eslint-plugin-forbidden-imports
```

---

## 🔧 Usage

In your root `.eslintrc.cjs`:

```js
module.exports = {
  plugins: ["forbidden-imports"],
  rules: {
    "forbidden-imports/forbidden-imports": "error",
  },
};
```

Now if someone writes:

```ts
import { something } from "@reflex/core";
```

They will get:

> ❌ Internal import '@reflex/core' is forbidden here. Use 'reflex' or 'reflex-dom' instead.

---

## 🧠 Why this exists

Reflex is designed as a **layered runtime system**:

```
Application  →  reflex  →  @reflex/core  →  @reflex/runtime  →  @reflex/contract
```

Only the public surface (`reflex`, `reflex-dom`) should be used by applications.

This plugin exists to:

- Protect runtime invariants
- Avoid experimental APIs leaking into apps
- Keep mental models clean for new developers
- Enforce system boundaries at scale

It is **not** about hierarchy or control.
It is about **system integrity**.

---

## 🧬 Philosophy

> In Reflex, architecture is not a suggestion.
> It is a **law of the universe**.

This plugin is one of those laws.

No `__DEV__`.
No build-time hacks.

Just a clear semantic boundary — enforced.

---

## 🔮 Future rules (planned)

This plugin may later include:

- `no-owner-mutation-inside-effect`
- `no-graph-mutation-outside-runtime`
- `no-cross-epoch-side-effects`
- `atomic-only-in-batch`
- `no-illegal-scheduler-usage`

In other words:
**Static enforcement of the Theory of Reactivity**.
