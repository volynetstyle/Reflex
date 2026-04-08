declare module "@volynets/reflex" {
  export type EffectCleanupRegistrar = (cleanup: () => void) => void;

  export function effect(fn: () => void | (() => void)): () => void;

  export function withEffectCleanupRegistrar<T>(
    registrar: EffectCleanupRegistrar | null,
    fn: () => T,
  ): T;
}

export {};
