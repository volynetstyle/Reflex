import makeStringSet from "./makeStringSet";

describe("makeStringSet", () => {
  test("корректно ищет существующие строки", () => {
    const set = makeStringSet(["apple", "banana", "cherry"]);
    expect(set.has("apple")).toBe(true);
    expect(set.has("banana")).toBe(true);
    expect(set.has("cherry")).toBe(true);
  });

  test("возвращает false для отсутствующих строк", () => {
    const set = makeStringSet(["apple", "banana"]);
    expect(set.has("orange")).toBe(false);
    expect(set.has("grape")).toBe(false);
  });

  test("обрабатывает дубликаты без ошибок", () => {
    const set = makeStringSet(["apple", "apple", "banana"]);
    expect(set.has("apple")).toBe(true);
    expect(set.has("banana")).toBe(true);
    expect(set.has("orange")).toBe(false);
  });

  test("корректно работает на пустом множестве", () => {
    const set = makeStringSet([]);
    expect(set.has("anything")).toBe(false);
  });

  test("корректно работает при большом количестве элементов", () => {
    const words = Array.from({ length: 10000 }, (_, i) => `word${i}`);
    const set = makeStringSet(words);

    // проверим несколько случайных элементов
    expect(set.has("word0")).toBe(true);
    expect(set.has("word5000")).toBe(true);
    expect(set.has("word9999")).toBe(true);
    expect(set.has("not_in_set")).toBe(false);
  });

  test("устойчив к коллизиям хэшей (принудительно)", () => {
    // подменим хэш-функцию, чтобы вызывать коллизии
    jest.mock("./core/utils/hash/fnv1aHashBytes", () => ({
      hash_32_fnv1a_const: (str: string) => str.length
    }));
    const { default: makeStringSetColl } = require("./makeStringSet");

    const set = makeStringSetColl(["a", "bb", "ccc"]);
    expect(set.has("a")).toBe(true);
    expect(set.has("bb")).toBe(true);
    expect(set.has("ccc")).toBe(true);
    expect(set.has("dddd")).toBe(false);
  });
});
