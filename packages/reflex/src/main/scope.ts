function scope<T>(fn: (dispose: Cleanup) => T): T;
function onScopeCleanup(fn: Cleanup): void;
