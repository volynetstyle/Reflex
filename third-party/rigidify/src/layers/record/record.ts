import { isTypeCompatible } from "../utils/type_check.js";

const IMMUTABLE = true;

class RecordLayer {
  static #build(defaults: Record<string, any> = {}, isMutable = IMMUTABLE) {
    const _keys = Object.keys(defaults);
    const _defaults = Object.create(null);

    for (const key of _keys) {
      _defaults[key] = defaults[key];
    }

    return class StructRecord {
      static fields = _keys;
      static defaults = _defaults;
      static isMutable = isMutable;

      static create(values: Record<string, any> = {}) {
        const obj: Record<string, any> = Object.create(null);

        for (const key of _keys) {
          const defaultKey = _defaults[key];
          const value = key in values ? values[key] : defaultKey;

          if (!isTypeCompatible(value, defaultKey)) {
            throw new Error(
              `Incompatible type for field "${key}": expected ${typeof defaultKey}, got ${typeof value}`
            );
          }

          obj[key] = value;
        }

        return Object.freeze(obj);
      }
    };
  }
}
