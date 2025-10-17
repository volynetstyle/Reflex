export namespace ReflexObject {
  export const Inherit = <T extends object>(proto: Partial<T>): T =>
    /**@__INLINE__ */ Object.create(proto) as T;
}
