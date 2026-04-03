export const HYDRATION_SLOT_START = "reflex-slot-start";
export const HYDRATION_SLOT_END = "reflex-slot-end";

export function isHydrationSlotStart(node: Node | null): node is Comment {
  return (
    node instanceof Comment &&
    node.data === HYDRATION_SLOT_START
  );
}

export function isHydrationSlotEnd(node: Node | null): node is Comment {
  return (
    node instanceof Comment &&
    node.data === HYDRATION_SLOT_END
  );
}

export function wrapHydrationSlotMarkup(content: string): string {
  return `<!--${HYDRATION_SLOT_START}-->${content}<!--${HYDRATION_SLOT_END}-->`;
}
