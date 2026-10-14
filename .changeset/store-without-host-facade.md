---
"@volynets/reflex-store": minor
---

Remove the host facade dependency and re-exports from Reflex Store. The runtime
entrypoint now exposes only store cells, scopes and owned computed getters used
by the compiler. Remove the unused runtime type facade. Use kernel batch
boundaries directly, and keep application scheduling in consumer code.

Validate the packed store with production and development runtime exports in a
consumer that does not install the host facade package.
