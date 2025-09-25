import { ReflexObject } from "./inherit";

describe("ReflexObject.Inherit", () => {
  it("should inherit methods and allow callSuper", () => {
    const proto = {
      value: 1,
      increment(n: number) {
        this.value += n;
        return this.value;
      },
    };

    const obj = ReflexObject.Inherit(proto);

    expect(obj.value).toBe(1);
    const result = obj.callSuper("increment", 5);
    expect(result).toBe(6);
    expect(obj.value).toBe(6);
  });

  it("should throw if no prototype for callSuper", () => {
    const obj = ReflexObject.Inherit(null);
    //@ts-ignore - testing runtime behavior
    expect(() => obj.callSuper("anyMethod")).toThrow(
      "[ReflexObject]: No prototype to call super on"
    );
  });

  it("should throw if key is not a function on prototype", () => {
    const proto = { foo: 123 };
    const obj = ReflexObject.Inherit(proto);
    expect(() => obj.callSuper("foo")).toThrow(/No method "foo" on prototype/);
  });
});
