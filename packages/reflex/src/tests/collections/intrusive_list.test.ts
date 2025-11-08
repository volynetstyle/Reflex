import test from "node:test";
import assert from "node:assert/strict";
import {
  IntrusiveListNode,
  newIntrusiveList,
} from "#reflex/core/collections/intrusive_list.js";

function makeNode(
  id: number
): IntrusiveListNode<{ id: number }> & { id: number } {
  return { id, _prev: undefined, _next: undefined, _list: undefined };
}

test("newIntrusiveList: создаёт чистый список", () => {
  const list = newIntrusiveList();
  assert.equal(list._head, undefined);
  assert.equal(list._tail, undefined);
  assert.equal(list._size, 0);
});

test("push: добавляет первый элемент корректно", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);

  list.push(a);

  assert.equal(list._head, a);
  assert.equal(list._tail, a);
  assert.equal(list._size, 1);
  assert.equal(a._list, list);
  assert.equal(a._prev, undefined);
  assert.equal(a._next, undefined);
});

test("push: добавляет несколько элементов в хвост", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);
  const b = makeNode(2);
  const c = makeNode(3);

  list.push(a);
  list.push(b);
  list.push(c);

  assert.equal(list._size, 3);
  assert.equal(list._head, a);
  assert.equal(list._tail, c);

  assert.equal(a._next, b);
  assert.equal(b._prev, a);
  assert.equal(b._next, c);
  assert.equal(c._prev, b);
});

test("push: повторное добавление того же узла игнорируется", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);
  list.push(a);
  list.push(a);
  assert.equal(list._size, 1);
});

test("remove: удаляет узел из середины списка", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);
  const b = makeNode(2);
  const c = makeNode(3);
  list.push(a);
  list.push(b);
  list.push(c);

  list.remove(b);

  assert.equal(list._size, 2);
  assert.equal(a._next, c);
  assert.equal(c._prev, a);
  assert.equal(b._list, undefined);
  assert.equal(list._head, a);
  assert.equal(list._tail, c);
});

test("remove: удаляет первый узел", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);
  const b = makeNode(2);
  list.push(a);
  list.push(b);

  list.remove(a);

  assert.equal(list._size, 1);
  assert.equal(list._head, b);
  assert.equal(b._prev, undefined);
});

test("remove: удаляет последний узел", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);
  const b = makeNode(2);
  list.push(a);
  list.push(b);

  list.remove(b);

  assert.equal(list._size, 1);
  assert.equal(list._tail, a);
  assert.equal(a._next, undefined);
});

test("remove: no-op если узел не из этого списка", () => {
  const list1 = newIntrusiveList();
  const list2 = newIntrusiveList();
  const a = makeNode(1);
  list1.push(a);

  list2.remove(a); // не должен изменить list1
  assert.equal(list1._size, 1);
  assert.equal(list2._size, 0);
});

test("clear: очищает все ссылки и сбрасывает размер", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);
  const b = makeNode(2);
  const c = makeNode(3);

  list.push(a);
  list.push(b);
  list.push(c);

  list.clear();

  assert.equal(list._head, undefined);
  assert.equal(list._tail, undefined);
  assert.equal(list._size, 0);

  for (const node of [a, b, c]) {
    assert.equal(node._list, undefined);
    assert.equal(node._prev, undefined);
    assert.equal(node._next, undefined);
  }
});

test("values: корректно итерирует все элементы в порядке вставки", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);
  const b = makeNode(2);
  const c = makeNode(3);
  list.push(a);
  list.push(b);
  list.push(c);

  const iterated = Array.from(list.values());
  assert.deepEqual(iterated, [a, b, c]);
});

test("values: после remove итерация возвращает только оставшиеся", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);
  const b = makeNode(2);
  const c = makeNode(3);
  list.push(a);
  list.push(b);
  list.push(c);

  list.remove(b);

  const iterated = Array.from(list.values());
  assert.deepEqual(iterated, [a, c]);
});

test("values: после clear итерация пуста", () => {
  const list = newIntrusiveList();
  const a = makeNode(1);
  const b = makeNode(2);
  list.push(a);
  list.push(b);

  list.clear();

  const iterated = Array.from(list.values());
  assert.deepEqual(iterated, []);
});
