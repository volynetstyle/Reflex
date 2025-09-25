export namespace ReflexObject {
  export interface SuperCaller<T extends object> {
    /**
     * Direct call to a prototype method, similar to `super`.
     */
    callSuper<K extends keyof T>(
      key: K,
      ...args: T[K] extends (...a: infer P) => any ? P : any
    ): T[K] extends (...a: any[]) => infer R ? R : any;
  }

  /**
   * Creates an object inheriting from `proto` with minimal overhead
   * and provides `callSuper` method.
   */
  export function Inherit<T extends object>(
    proto: T | null = null
  ): T & SuperCaller<T> {
    const obj = Object.create(proto) as T & SuperCaller<T>;

    if (proto) {
      // Directly bind prototype methods once, avoid per-call lookup
      const callSuper = <K extends keyof T>(key: K, ...args: any[]) => {
        const method = proto[key] as Function;
        if (!method || typeof method !== "function")
          throw new Error(
            `[ReflexObject]: No method "${String(key)}" on prototype`
          );
        return method.apply(obj, args);
      };

      Object.defineProperty(obj, "callSuper", {
        value: callSuper,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    } else {
      Object.defineProperty(obj, "callSuper", {
        value: () => {
          throw new Error("[ReflexObject]: No prototype to call super on");
        },
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }

    return obj;
  }
}
