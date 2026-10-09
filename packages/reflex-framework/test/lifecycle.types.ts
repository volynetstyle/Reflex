import type { LifecycleScope } from "../src/ownership";

declare const scope: LifecycleScope;
declare const maybeAsync: () => void | Promise<void>;

scope.defer(() => {});

// @ts-expect-error Asynchronous cleanup cannot be registered.
scope.defer(async () => {});

// @ts-expect-error A possible Promise-like result is also rejected.
scope.defer(maybeAsync);
