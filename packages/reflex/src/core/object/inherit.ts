export namespace ReflexObject {
  export interface SuperCaller<T extends object> {
    callSuper<K extends keyof T>(
      key: K,
      ...args: T[K] extends (...a: infer P) => any ? P : any
    ): T[K] extends (...a: any[]) => infer R ? R : any;
  }

  function universalCallSuper<T extends object>(
    this: T & { __protoTarget?: object },
    key: keyof T,
    ...args: any[]
  ): any {
    const proto = this.__protoTarget;

    if (!proto) {
      throw new Error("[ReflexObject]: No prototype to call super on");
    }

    const method = (proto as any)[key];
    if (typeof method !== "function") {
      throw new Error(
        `[ReflexObject]: No method "${String(key)}" on prototype`
      );
    }

    return method.apply(this, args);
  }

  export function Inherit<T extends object>(
    proto: T | null = null
  ): T & SuperCaller<T> {
    const obj = Object.create(proto) as T &
      SuperCaller<T> & {
        __protoTarget?: object;
      };

    obj.__protoTarget = proto ?? undefined;

    Object.defineProperty(obj, "callSuper", {
      value: universalCallSuper,
      writable: false,
      enumerable: false,
      configurable: false,
    });

    return obj;
  }
}
