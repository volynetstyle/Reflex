import type { RuntimeDebugEvent } from "@volynets/reflex/debug";
import cytoscape, {
  type Core,
  type ElementDefinition,
  type StylesheetJson,
} from "cytoscape";
import {
  formatHistoryEvent,
  eventTooltip,
  shouldVisualizeEvent,
} from "./RuntimeFormatters";
import {
  getConnectedNodeIds,
  formatNodeLabel,
  type RuntimeGraphModel,
} from "./RuntimeGraphModel";
import {
  RUNTIME_CYTOSCAPE_CLASSES,
  RUNTIME_GRAPH_COLORS,
  RUNTIME_GRAPH_TIMING,
  RUNTIME_GRAPH_VIEW,
  RUNTIME_HISTORY_PANEL_LIMIT,
} from "./RuntimeConstants";
import type { RuntimeLayoutComposer } from "./RuntimeLayoutComposer";

type RuntimeCytoscapeControllerOptions = {
  container: HTMLDivElement;
  graph: RuntimeGraphModel;
  history: HTMLOListElement | null;
  layout: RuntimeLayoutComposer;
  overlay: HTMLDivElement | null;
  summary: HTMLDivElement | null;
};

export type RuntimeCytoscapeController = {
  cy: Core;
  destroy(): void;
  highlight(event: RuntimeDebugEvent): void;
  render(): void;
  resize(): void;
};

const runtimeStyles: StylesheetJson = [
  {
    selector: "node",
    style: {
      "background-color": "data(color)",
      "border-color": "data(borderColor)",
      "border-width": RUNTIME_GRAPH_VIEW.nodeBorderWidth,
      color: RUNTIME_GRAPH_COLORS.label,
      "font-size": RUNTIME_GRAPH_VIEW.labelFontSize,
      "font-weight": 700,
      label: "data(label)",
      "min-zoomed-font-size": RUNTIME_GRAPH_VIEW.minZoomedLabelFontSize,
      "overlay-opacity": 0,
      "text-background-color": RUNTIME_GRAPH_COLORS.labelBackground,
      "text-background-opacity": RUNTIME_GRAPH_VIEW.labelTextBackgroundOpacity,
      "text-background-padding": "3px",
      "text-halign": "center",
      "text-margin-y": RUNTIME_GRAPH_VIEW.labelMarginY,
      "text-max-width": "92px",
      "text-overflow-wrap": "anywhere",
      "text-valign": "bottom",
      width: RUNTIME_GRAPH_VIEW.nodeSize,
      height: RUNTIME_GRAPH_VIEW.nodeSize,
    },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "line-color": RUNTIME_GRAPH_COLORS.edge,
      opacity: RUNTIME_GRAPH_VIEW.edgeOpacity,
      "target-arrow-color": RUNTIME_GRAPH_COLORS.edgeArrow,
      "target-arrow-shape": "triangle",
      width: RUNTIME_GRAPH_VIEW.edgeWidth,
    },
  },
  {
    selector: `.${RUNTIME_CYTOSCAPE_CLASSES.changedNode}`,
    style: {
      "border-color": RUNTIME_GRAPH_COLORS.active,
      "border-width": RUNTIME_GRAPH_VIEW.nodeChangedBorderWidth,
    },
  },
  {
    selector: `.${RUNTIME_CYTOSCAPE_CLASSES.activeEdge}`,
    style: {
      "line-color": RUNTIME_GRAPH_COLORS.active,
      opacity: 1,
      "target-arrow-color": RUNTIME_GRAPH_COLORS.active,
      width: RUNTIME_GRAPH_VIEW.activeEdgeWidth,
    },
  },
  {
    selector: 'node[dirty != "clean"]',
    style: {
      "border-color": RUNTIME_GRAPH_COLORS.dirty,
      "border-width": RUNTIME_GRAPH_VIEW.dirtyBorderWidth,
    },
  },
  {
    selector: ":selected",
    style: {
      "background-color": RUNTIME_GRAPH_COLORS.active,
      "line-color": RUNTIME_GRAPH_COLORS.active,
      "target-arrow-color": RUNTIME_GRAPH_COLORS.active,
    },
  },
];

function toElements(graph: RuntimeGraphModel): ElementDefinition[] {
  const connectedNodeIds = getConnectedNodeIds(graph.edges);
  const elements: ElementDefinition[] = [];

  for (const node of graph.nodes.values()) {
    if (!connectedNodeIds.has(node.id)) continue;

    elements.push({
      data: {
        id: String(node.id),
        label: formatNodeLabel(node),
        kind: node.kind,
        dirty: node.dirty,
        flags: node.flags.join(", "),
        color: RUNTIME_GRAPH_COLORS.nodeKinds[node.kind],
        borderColor: RUNTIME_GRAPH_COLORS.nodeBorder,
      },
    });
  }

  for (const edge of graph.edges.values()) {
    elements.push({
      data: {
        id: edge.id,
        source: String(edge.source),
        target: String(edge.target),
      },
    });
  }

  return elements;
}

export function createRuntimeCytoscapeController({
  container,
  graph,
  history,
  layout,
  overlay,
  summary,
}: RuntimeCytoscapeControllerOptions): RuntimeCytoscapeController {
  const activeTips = new Map<number, number>();
  let didInitialFit = false;
  let userChangedViewport = false;

  const cy = cytoscape({
    container,
    elements: toElements(graph),
    layout: {
      name: "preset",
      fit: true,
      padding: RUNTIME_GRAPH_VIEW.fitPadding,
    },
    style: runtimeStyles,
  });

  cy.on("dragfree", "node", (event) => {
    const nodeId = Number(event.target.id());
    if (!Number.isFinite(nodeId)) return;

    layout.rememberManualPosition(nodeId, event.target.position());
  });

  cy.on("pan zoom", () => {
    userChangedViewport = true;
  });

  const syncElements = () => {
    const connectedNodeIds = getConnectedNodeIds(graph.edges);

    cy.nodes().forEach((node) => {
      if (!connectedNodeIds.has(Number(node.id()))) node.remove();
    });

    cy.edges().forEach((edge) => {
      if (!graph.edges.has(edge.id())) edge.remove();
    });

    for (const node of graph.nodes.values()) {
      if (!connectedNodeIds.has(node.id)) continue;

      const id = String(node.id);
      const data = {
        id,
        label: formatNodeLabel(node),
        kind: node.kind,
        dirty: node.dirty,
        flags: node.flags.join(", "),
        color: RUNTIME_GRAPH_COLORS.nodeKinds[node.kind],
        borderColor: RUNTIME_GRAPH_COLORS.nodeBorder,
      };
      const existing = cy.getElementById(id);

      if (existing.length > 0) {
        existing.data(data);
      } else {
        cy.add({ group: "nodes", data });
      }
    }

    for (const edge of graph.edges.values()) {
      if (cy.getElementById(edge.id).length > 0) continue;
      if (cy.getElementById(String(edge.source)).empty()) continue;
      if (cy.getElementById(String(edge.target)).empty()) continue;

      cy.add({
        group: "edges",
        data: {
          id: edge.id,
          source: String(edge.source),
          target: String(edge.target),
        },
      });
    }
  };

  const updateHistory = () => {
    if (history === null) return;

    const start = Math.max(
      0,
      graph.history.length - RUNTIME_HISTORY_PANEL_LIMIT,
    );
    const items: HTMLElement[] = [];

    for (let i = graph.history.length - 1; i >= start; i--) {
      const event = graph.history[i];
      if (event === undefined) continue;

      const item = document.createElement("li");
      const type = document.createElement("span");
      const detail = document.createElement("small");

      type.textContent = event.type;
      detail.textContent = formatHistoryEvent(event);
      item.append(type, detail);
      items.push(item);
    }

    history.replaceChildren(...items);
    history.dataset.count = String(graph.eventCount);
  };

  const updateSummary = () => {
    if (summary !== null) {
      const connectedCount = getConnectedNodeIds(graph.edges).size;
      summary.textContent = `${connectedCount} nodes, ${graph.edges.size} edges`;
    }

    updateHistory();
  };

  const showTooltip = (nodeId: number, message: string) => {
    const node = cy.getElementById(String(nodeId));
    if (overlay === null || node.empty()) return;

    const position = node.renderedPosition();
    const nodeIdStr = String(nodeId);
    const existing = overlay.querySelector<HTMLElement>(
      `[data-node-id="${nodeIdStr}"]`,
    );
    const tip = existing ?? document.createElement("div");

    tip.dataset.nodeId = nodeIdStr;
    tip.className = RUNTIME_CYTOSCAPE_CLASSES.tooltip;
    tip.textContent = message;
    tip.style.left = `${position.x}px`;
    tip.style.top = `${position.y}px`;
    if (existing === null) overlay.append(tip);

    const prevTimer = activeTips.get(nodeId);
    if (prevTimer !== undefined) window.clearTimeout(prevTimer);

    const timer = window.setTimeout(() => {
      tip.classList.add(RUNTIME_CYTOSCAPE_CLASSES.tooltipHidden);
      activeTips.delete(nodeId);
      window.setTimeout(
        () => tip.remove(),
        RUNTIME_GRAPH_TIMING.tooltipRemoveMs,
      );
    }, RUNTIME_GRAPH_TIMING.tooltipVisibleMs);
    activeTips.set(nodeId, timer);
  };

  const findPathEdges = (startId: number): string[] => {
    const visited = new Set<number>();
    const queue = [startId];
    const path: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);

      for (const edge of graph.edges.values()) {
        if (edge.source !== current) continue;

        path.push(edge.id);
        queue.push(edge.target);
      }
    }

    return path;
  };

  const clearTooltips = () => {
    for (const timer of activeTips.values()) {
      window.clearTimeout(timer);
    }
    activeTips.clear();
    overlay?.replaceChildren();
  };

  return {
    cy,

    destroy() {
      clearTooltips();
      cy.destroy();
    },

    highlight(event) {
      if (!shouldVisualizeEvent(event)) return;

      const { source, node, target, consumer } = event;
      const nodeIds: number[] = [];
      if (source !== undefined) nodeIds.push(source.id);
      if (node !== undefined) nodeIds.push(node.id);
      if (target !== undefined) nodeIds.push(target.id);
      if (consumer !== undefined) nodeIds.push(consumer.id);

      const edgeIds =
        event.type === "write:producer" && node !== undefined
          ? findPathEdges(node.id)
          : source !== undefined && consumer !== undefined
            ? [`${source.id}->${consumer.id}`]
            : source !== undefined && target !== undefined
              ? [`${source.id}->${target.id}`]
              : [];

      const tooltip = eventTooltip(event);
      for (const nodeId of nodeIds) {
        const element = cy.getElementById(String(nodeId));
        element.addClass(RUNTIME_CYTOSCAPE_CLASSES.changedNode);
        showTooltip(nodeId, tooltip);
        window.setTimeout(
          () => element.removeClass(RUNTIME_CYTOSCAPE_CLASSES.changedNode),
          RUNTIME_GRAPH_TIMING.nodeHighlightMs,
        );
      }

      edgeIds.forEach((edgeId, index) => {
        const edge = cy.getElementById(edgeId);
        window.setTimeout(() => {
          edge.addClass(RUNTIME_CYTOSCAPE_CLASSES.activeEdge);
          window.setTimeout(
            () => edge.removeClass(RUNTIME_CYTOSCAPE_CLASSES.activeEdge),
            RUNTIME_GRAPH_TIMING.edgeHighlightMs,
          );
        }, index * RUNTIME_GRAPH_TIMING.edgeHighlightStaggerMs);
      });
    },

    render() {
      cy.batch(syncElements);
      cy.resize();
      layout.apply(
        cy,
        graph.nodes,
        graph.edges,
        getConnectedNodeIds(graph.edges),
      );
      if (!didInitialFit && !cy.elements().empty()) {
        cy.fit(undefined, RUNTIME_GRAPH_VIEW.fitPadding);
        didInitialFit = true;
        userChangedViewport = false;
      }
      updateSummary();
    },

    resize() {
      cy.resize();
      if (!userChangedViewport && !cy.elements().empty()) {
        cy.fit(undefined, RUNTIME_GRAPH_VIEW.fitPadding);
      }
    },
  };
}
