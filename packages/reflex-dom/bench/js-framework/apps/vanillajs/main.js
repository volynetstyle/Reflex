/* global document */
// Reference implementation following js-framework-benchmark's
// frameworks/keyed/vanillajs: rows cloned from a template, updated in place,
// event delegation on the table body, and direct DOM moves for swaps.
//
// Extended scenarios (README.md): a change the handler knows exactly is
// applied with direct DOM calls; a snapshot (new array of new objects, no
// description of the change) goes through `applySnapshot`, the reconciliation
// a hand-written application would use without a diff library: rows looked up
// by id, labels compared before writing, missing rows removed, and the order
// restored by a single cursor walk that moves every row found out of place.

import { buildData } from "../../shared/data.js";
import {
  interleave,
  moveBackward,
  moveForward,
  prepend as prependData,
  refreshEvery10th,
  refreshOne,
  removeEvery10th,
  replaceHalf,
  reverse,
  updateAll as updateAllData,
} from "../../shared/ops.js";

const tbody = document.getElementById("tbody");
const rowTemplate = document.createElement("tr");
rowTemplate.innerHTML =
  "<td class='col-md-1'> </td>" +
  "<td class='col-md-4'><a class='lbl'> </a></td>" +
  "<td class='col-md-1'><a class='remove'><span class='remove glyphicon glyphicon-remove' aria-hidden='true'></span></a></td>" +
  "<td class='col-md-6'></td>";

let data = [];
let rows = [];
let selectedRow = null;

function createRow(item) {
  const tr = rowTemplate.cloneNode(true);
  const idCell = tr.firstChild;
  const label = idCell.nextSibling.firstChild;

  tr.dataId = item.id;
  idCell.firstChild.nodeValue = item.id;
  label.firstChild.nodeValue = item.label;
  return tr;
}

function appendRows(items) {
  for (let i = 0; i < items.length; i++) {
    const tr = createRow(items[i]);
    rows.push(tr);
    tbody.appendChild(tr);
  }
}

function removeAllRows() {
  tbody.textContent = "";
  rows = [];
  data = [];
  selectedRow = null;
}

function run(count) {
  removeAllRows();
  data = buildData(count);
  appendRows(data);
}

function add() {
  const items = buildData(1000);
  data = data.concat(items);
  appendRows(items);
}

function update() {
  for (let i = 0; i < data.length; i += 10) {
    const item = data[i];
    item.label += " !!!";
    rows[i].childNodes[1].firstChild.firstChild.nodeValue = item.label;
  }
}

function swapRows() {
  if (data.length <= 998) return;

  const first = rows[1];
  const second = rows[998];
  const afterSecond = second.nextSibling;

  tbody.insertBefore(second, first);
  tbody.insertBefore(first, afterSecond);

  [data[1], data[998]] = [data[998], data[1]];
  [rows[1], rows[998]] = [rows[998], rows[1]];
}

function indexOfRow(tr) {
  const id = tr.dataId;
  for (let i = 0; i < data.length; i++) {
    if (data[i].id === id) return i;
  }
  return -1;
}

function select(tr) {
  if (selectedRow !== null) selectedRow.className = "";
  tr.className = "danger";
  selectedRow = tr;
}

function remove(tr) {
  const index = indexOfRow(tr);
  if (index < 0) return;
  if (selectedRow === tr) selectedRow = null;

  tr.remove();
  data.splice(index, 1);
  rows.splice(index, 1);
}

const labelText = (tr) => tr.childNodes[1].firstChild.firstChild;

function applySnapshot(next) {
  const previousIndex = new Map();
  for (let i = 0; i < data.length; i++) previousIndex.set(data[i].id, i);

  const nextRows = new Array(next.length);
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const index = previousIndex.get(item.id);
    if (index === undefined) {
      nextRows[i] = createRow(item);
      continue;
    }
    const tr = rows[index];
    if (data[index].label !== item.label) labelText(tr).nodeValue = item.label;
    nextRows[i] = tr;
    previousIndex.delete(item.id);
  }

  for (const index of previousIndex.values()) {
    const tr = rows[index];
    if (tr === selectedRow) selectedRow = null;
    tr.remove();
  }

  let cursor = tbody.firstChild;
  for (let i = 0; i < nextRows.length; i++) {
    const tr = nextRows[i];
    if (tr === cursor) cursor = cursor.nextSibling;
    else tbody.insertBefore(tr, cursor);
  }

  data = next;
  rows = nextRows;
}

function updateAll() {
  data = updateAllData(data);
  for (let i = 0; i < data.length; i++) labelText(rows[i]).nodeValue = data[i].label;
}

function prependRows() {
  const next = prependData(data);
  const count = next.length - data.length;
  const created = new Array(count);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) fragment.appendChild((created[i] = createRow(next[i])));
  tbody.insertBefore(fragment, tbody.firstChild);
  data = next;
  rows = created.concat(rows);
}

function removeEvery10thRow() {
  for (let i = 0; i < rows.length; i += 10) {
    if (rows[i] === selectedRow) selectedRow = null;
    rows[i].remove();
  }
  data = removeEvery10th(data);
  rows = rows.filter((_, index) => index % 10 !== 0);
}

const snapshot = (operation) => () => applySnapshot(operation(data));

const actions = {
  run: () => run(1000),
  runlots: () => run(10000),
  add,
  update,
  clear: removeAllRows,
  swaprows: swapRows,
  refreshone: snapshot(refreshOne),
  refresh10th: snapshot(refreshEvery10th),
  moveforward: snapshot(moveForward),
  movebackward: snapshot(moveBackward),
  reverse: snapshot(reverse),
  interleave: snapshot(interleave),
  replacehalf: snapshot(replaceHalf),
  updateall: updateAll,
  prepend: prependRows,
  remove10th: removeEvery10thRow,
};

document.getElementById("main").addEventListener("click", (event) => {
  const action = actions[event.target.id];
  if (action !== undefined) {
    event.preventDefault();
    action();
  }
});

tbody.addEventListener("click", (event) => {
  const target = event.target;
  const tr = target.closest("tr");
  if (tr === null) return;

  if (target.matches(".lbl")) {
    event.preventDefault();
    select(tr);
  } else if (target.matches(".remove")) {
    event.preventDefault();
    remove(tr);
  }
});
