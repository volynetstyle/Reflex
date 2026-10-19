// Data transformations of the extended scenarios, shared by every
// implementation and mirrored by the harness on row ids.
//
// "Snapshot" operations return a new array of new row objects, as data
// reloaded from a server would arrive: the receiver is not told what changed.
// "Direct" operations describe a change the handler knows exactly.

import { buildData } from "./data.js";

/** Marker appended to labels by the label-changing operations. */
export const MARK = " *";

const copy = (row) => ({ id: row.id, label: row.label });
const marked = (row) => ({ id: row.id, label: row.label + MARK });

/** Snapshot: every row is a new object; only the first label changes. */
export function refreshOne(data) {
  return data.map((row, index) => (index === 0 ? marked(row) : copy(row)));
}

/** Snapshot: every row is a new object; every 10th label changes. */
export function refreshEvery10th(data) {
  return data.map((row, index) => (index % 10 === 0 ? marked(row) : copy(row)));
}

/** Snapshot: the row at index 998 moves to index 1. */
export function moveForward(data) {
  if (data.length <= 998) return data.map(copy);
  const next = data.map(copy);
  const [row] = next.splice(998, 1);
  next.splice(1, 0, row);
  return next;
}

/** Snapshot: the row at index 1 moves to index 998. */
export function moveBackward(data) {
  if (data.length <= 998) return data.map(copy);
  const next = data.map(copy);
  const [row] = next.splice(1, 1);
  next.splice(998, 0, row);
  return next;
}

/** Snapshot: reversed order. */
export function reverse(data) {
  return data.map(copy).reverse();
}

/** Snapshot: rows at even indices, then rows at odd indices. */
export function interleave(data) {
  const next = [];
  for (let i = 0; i < data.length; i += 2) next.push(copy(data[i]));
  for (let i = 1; i < data.length; i += 2) next.push(copy(data[i]));
  return next;
}

/** Snapshot: every second row is replaced by a new row (new id). */
export function replaceHalf(data) {
  const fresh = buildData(Math.floor(data.length / 2));
  let next = 0;
  return data.map((row, index) => (index % 2 === 1 ? fresh[next++] : copy(row)));
}

/** Direct: every label changes. */
export function updateAll(data) {
  return data.map(marked);
}

/** Direct: 1,000 new rows before the existing ones. */
export function prepend(data) {
  return buildData(1000).concat(data);
}

/** Direct: every 10th row is removed. */
export function removeEvery10th(data) {
  return data.filter((_, index) => index % 10 !== 0);
}

/** Scenario id -> transformation, used by both applications. */
export const operations = {
  refreshone: refreshOne,
  refresh10th: refreshEvery10th,
  moveforward: moveForward,
  movebackward: moveBackward,
  reverse,
  interleave,
  replacehalf: replaceHalf,
  updateall: updateAll,
  prepend,
  remove10th: removeEvery10th,
};
