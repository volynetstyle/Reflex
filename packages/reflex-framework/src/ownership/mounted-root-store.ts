export interface MountedRootStore<TKey extends object, TRoot> {
  get(key: TKey): TRoot | undefined;
  set(key: TKey, root: TRoot): void;
  delete(key: TKey): void;
}

export function createMountedRootStore<TKey extends object, TRoot>(
  slot: PropertyKey,
): MountedRootStore<TKey, TRoot> {
  return {
    get(key) {
      return (key as Record<PropertyKey, unknown>)[slot] as TRoot | undefined;
    },
    set(key, root) {
      (key as Record<PropertyKey, unknown>)[slot] = root;
    },
    delete(key) {
      (key as Record<PropertyKey, unknown>)[slot] = undefined;
    },
  };
}
