export interface RootMountTable<TKey extends object, TRoot> {
  get(host: TKey): TRoot | undefined;
  set(host: TKey, root: TRoot): void;
  unset(host: TKey): void;
}

export function createRootMountTable<TKey extends object, TRoot>(
  slot: PropertyKey,
): RootMountTable<TKey, TRoot> {
  const asSlots = (host: TKey): Record<PropertyKey, TRoot | undefined> =>
    host as unknown as Record<PropertyKey, TRoot | undefined>;

  return {
    get(host) {
      return asSlots(host)[slot];
    },

    set(host, root) {
      asSlots(host)[slot] = root;
    },

    unset(host) {
      delete asSlots(host)[slot];
    },
  };
}