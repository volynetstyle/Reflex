/** @jsxImportSource @volynets/reflex-dom/standalone */
// Keyed implementation in the style of js-framework-benchmark's framework
// entries: immutable rows rendered by a keyed `For`, the selection held as one
// id, handlers bound per element (no manual DOM, no explicit delegation, no
// requestAnimationFrame). Every extended scenario (README.md) is the same
// immutable update: the next array from ../../shared/ops.js.

import { For, createApp, useSignal } from "@volynets/reflex-dom/standalone";
import { buildData, type RowData } from "../../shared/data.js";
import { operations } from "../../shared/ops.js";
import extendedButtons from "../../shared/buttons.json";

interface ButtonProps {
  id: string;
  title: string;
  onClick: () => void;
}

function Button(props: ButtonProps) {
  return (
    <div class="col-sm-6 smallpad">
      <button
        type="button"
        class="btn btn-primary btn-block"
        id={props.id}
        onClick={props.onClick}
      >
        {props.title}
      </button>
    </div>
  );
}

function App() {
  const rows = useSignal<readonly RowData[]>([]);
  const selected = useSignal(0);

  const run = () => {
    rows(buildData(1000));
    selected(0);
  };
  const runLots = () => {
    rows(buildData(10000));
    selected(0);
  };
  const add = () => rows((current) => current.concat(buildData(1000)));
  const update = () =>
    rows((current) => {
      const next = current.slice();
      for (let i = 0; i < next.length; i += 10) {
        const row = next[i]!;
        next[i] = { id: row.id, label: row.label + " !!!" };
      }
      return next;
    });
  const clear = () => {
    rows([]);
    selected(0);
  };
  const swapRows = () =>
    rows((current) => {
      if (current.length <= 998) return current;
      const next = current.slice();
      const first = next[1]!;
      next[1] = next[998]!;
      next[998] = first;
      return next;
    });
  const remove = (id: number) =>
    rows((current) => {
      const index = current.findIndex((row) => row.id === id);
      return index < 0 ? current : current.toSpliced(index, 1);
    });

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Reflex DOM-"keyed"</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <Button id="run" title="Create 1,000 rows" onClick={run} />
              <Button id="runlots" title="Create 10,000 rows" onClick={runLots} />
              <Button id="add" title="Append 1,000 rows" onClick={add} />
              <Button id="update" title="Update every 10th row" onClick={update} />
              <Button id="clear" title="Clear" onClick={clear} />
              <Button id="swaprows" title="Swap Rows" onClick={swapRows} />
              {(extendedButtons as [string, string][]).map(([id, title]) => (
                <Button
                  id={id}
                  title={title}
                  onClick={() => rows((current) => operations[id]!(current))}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          <For each={rows} by={(row) => row.id}>
            {(row) => {
              const id = row().id;
              return (
              <tr class={() => (selected() === id ? "danger" : null)}>
                <td class="col-md-1">{id}</td>
                <td class="col-md-4">
                  <a onClick={() => selected(id)}>{() => row().label}</a>
                </td>
                <td class="col-md-1">
                  <a onClick={() => remove(id)}>
                    <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                  </a>
                </td>
                <td class="col-md-6" />
              </tr>
              );
            }}
          </For>
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  );
}

createApp().render(<App />, document.getElementById("main")!);
