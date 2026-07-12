import { bench, describe } from "vitest";
import {
  addCleanup,
  contextLookup,
  createContext,
  createOwnershipNode,
  disposeOwnershipNode,
  prependChild,
  provideContext,
  type OwnershipNode,
} from "../src/ownership";

let sink = 0;

const ThemeContext = createContext("light");
const LocaleContext = createContext("en");
const RowContext = createContext(-1);

function component(parent: OwnershipNode, cleanups = 0): OwnershipNode {
  const node = createOwnershipNode();
  prependChild(parent, node);

  for (let index = 0; index < cleanups; index += 1) {
    addCleanup(node, () => {
      sink ^= index;
    });
  }

  return node;
}

/** A dashboard with a shell, navigation, toolbar and a grid of stateful cards. */
function mountDashboard(cardCount: number): OwnershipNode {
  const root = createOwnershipNode();
  provideContext(root, ThemeContext, "dark");
  provideContext(root, LocaleContext, "uk");

  const shell = component(root, 2);
  const sidebar = component(shell, 1);
  for (let item = 0; item < 12; item += 1) component(sidebar, 1);

  const content = component(shell, 1);
  const toolbar = component(content, 2);
  for (let control = 0; control < 8; control += 1) component(toolbar, 1);

  const grid = component(content);
  for (let card = 0; card < cardCount; card += 1) {
    const cardNode = component(grid, 2);
    component(cardNode); // heading
    const chart = component(cardNode, 2);
    for (let point = 0; point < 24; point += 1) component(chart);
    component(cardNode, 1); // footer/actions
    sink ^= contextLookup(cardNode, ThemeContext).length;
    sink ^= contextLookup(cardNode, LocaleContext).length;
  }

  return root;
}

/** A table viewport: each row provides row state consumed by its cells. */
function mountTableViewport(
  rowCount: number,
  columnCount: number,
): OwnershipNode {
  const viewport = createOwnershipNode();

  for (let row = 0; row < rowCount; row += 1) {
    const rowNode = component(viewport, 1);
    provideContext(rowNode, RowContext, row);

    for (let column = 0; column < columnCount; column += 1) {
      const cell = component(rowNode, column === columnCount - 1 ? 1 : 0);
      sink ^= contextLookup(cell, RowContext) ?? 0;
    }
  }

  return viewport;
}

/** A route-shaped tree with nested layouts, forms and async subscriptions. */
function mountRoute(fieldCount: number): OwnershipNode {
  const route = createOwnershipNode();
  const layout = component(route, 2);
  const header = component(layout, 1);
  for (let action = 0; action < 6; action += 1) component(header, 1);

  const form = component(layout, 3);
  for (let field = 0; field < fieldCount; field += 1) {
    const wrapper = component(form, 1);
    component(wrapper); // label
    component(wrapper, 2); // input + validation subscription
    if (field % 4 === 0) component(wrapper); // optional help text
  }

  return route;
}

describe("ui scenarios: screen lifecycle", () => {
  bench("dashboard mount + unmount / 24 cards", () => {
    disposeOwnershipNode(mountDashboard(24));
  });

  bench("settings route transition / 40 fields", () => {
    const previousRoute = mountRoute(40);
    disposeOwnershipNode(previousRoute);
    disposeOwnershipNode(mountRoute(40));
  });
});

describe("ui scenarios: repeated updates", () => {
  bench("virtualized table viewport replace / 50 x 8", () => {
    const previousViewport = mountTableViewport(50, 8);
    const nextViewport = mountTableViewport(50, 8);
    disposeOwnershipNode(previousViewport);
    disposeOwnershipNode(nextViewport);
  });

  bench("search results replace / 100 rows x 4", () => {
    const previousResults = mountTableViewport(100, 4);
    disposeOwnershipNode(previousResults);
    disposeOwnershipNode(mountTableViewport(100, 4));
  });
});
