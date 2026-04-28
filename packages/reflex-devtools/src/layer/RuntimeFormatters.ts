import type {
  RuntimeDebugEvent,
  RuntimeDebugNodeRef,
} from "@volynets/reflex-runtime/debug";
import { formatNodeLabel } from "./RuntimeGraphModel";

function formatEventNode(node: RuntimeDebugNodeRef | undefined): string {
  return node === undefined ? "" : ` ${formatNodeLabel(node)}`;
}

export function formatHistoryEvent(event: RuntimeDebugEvent): string {
  if (event.type === "track:read") {
    return `${formatEventNode(event.source)} ->${formatEventNode(event.consumer)}`;
  }

  if (event.type === "cleanup:stale-sources") {
    const removedCount = event.detail?.removedCount ?? 0;
    return `${formatEventNode(event.node)} removed ${String(removedCount)} source(s)`;
  }

  return `${formatEventNode(event.node)}${formatEventNode(event.source)}${formatEventNode(event.target)}`;
}

export function eventTooltip(event: RuntimeDebugEvent): string {
  const { type } = event;
  if (type === "write:producer") return "write";
  if (type === "track:read") return "tracked";
  if (type === "recompute") return "recomputed";
  if (type === "propagate") return "propagated";
  if (type === "cleanup:stale-sources") return "cleanup";
  if (type === "watcher:dispose") return "disposed";
  if (type.startsWith("compute:")) return type.slice("compute:".length);
  if (type.startsWith("watcher:run:")) {
    return `run ${type.slice("watcher:run:".length)}`;
  }

  return type;
}

function eventChanged(event: RuntimeDebugEvent): boolean | undefined {
  const changed = event.detail?.changed;

  return typeof changed === "boolean" ? changed : undefined;
}

export function shouldVisualizeEvent(event: RuntimeDebugEvent): boolean {
  const changed = eventChanged(event);

  if (event.type === "write:producer" || event.type === "recompute") {
    return changed !== false;
  }

  return true;
}
