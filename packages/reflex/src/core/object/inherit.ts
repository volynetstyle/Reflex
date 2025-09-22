export namespace ReflexObject {
  export interface SuperCaller<T extends object> {
    /**
     * Вызов метода прототипа напрямую.
     * Аналог "super" для прототипного наследования.
     */
    callSuper<K extends keyof T>(
      key: K,
      ...args: T[K] extends (...a: infer P) => any ? P : never
    ): T[K] extends (...a: any[]) => infer R ? R : never;
  }

  /**
   * Создаёт новый объект, наследующий от `proto`,
   * и добавляет удобный метод `callSuper`.
   */
  export function Inherit<T extends object>(
    proto: T | null = null
  ): T & SuperCaller<T> {
    const obj = Object.create(proto) as T & SuperCaller<T>;

    Object.defineProperty(obj, "callSuper", {
      value<K extends keyof T>(
        key: K,
        ...args: T[K] extends (...a: infer P) => any ? P : never
      ) {
        if (!proto) {
          throw new Error("[ReflexObject]: No prototype to call super on");
        }

        const method = proto[key];
        
        if (typeof method !== "function") {
          throw new Error(
            `[ReflexObject]: ${String(key)} is not a function on prototype`
          );
        }

        return method.apply(this, args);
      },
      writable: false,
      enumerable: false,
      configurable: false,
    });

    return obj;
  }
}
