export const ReflexObject = {
  /**@__INLINE__ */
  Inherit: <T extends object>(proto: Partial<T>): T =>
    Object.create(proto) as T,
} as const;
