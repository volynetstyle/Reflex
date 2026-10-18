/* global document */
// Reference implementation following js-framework-benchmark's
// frameworks/keyed/vanillajs: rows cloned from a template, updated in place,
// event delegation on the table body, and direct DOM moves for swaps.

import { buildData } from "../../shared/data.js";

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

const actions = {
  run: () => run(1000),
  runlots: () => run(10000),
  add,
  update,
  clear: removeAllRows,
  swaprows: swapRows,
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
