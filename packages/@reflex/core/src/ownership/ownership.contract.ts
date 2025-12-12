type ContextKeyType = string;

interface IOwnershipContextRecord {
  [key: ContextKeyType]: unknown;
}

interface IOwnershipContext<T = unknown> {
  readonly id: symbol;
  readonly defaultValue?: T;
}

interface IOwnership {
  onScopeMount(fn: () => void): void;
  onScopeCleanup(fn: () => void): void;

  dispose(): void;

  provide(key: ContextKeyType, value: unknown): void;
  inject<T>(key: ContextKeyType): T | undefined;
  hasOwn(key: ContextKeyType): boolean;
}

interface ICleanupScope {
  onScopeCleanup(fn: () => void): void;
}

interface IContextAccess {
  provide(key: ContextKeyType, value: unknown): void;
  inject<T>(key: ContextKeyType): T | undefined;
  hasOwn(key: ContextKeyType): boolean;
}

export type {
  ContextKeyType,
  IOwnershipContextRecord,
  IOwnershipContext,
  IOwnership,
  ICleanupScope,
  IContextAccess,
};
