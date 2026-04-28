import { isHydrationSlotEnd, isHydrationSlotStart } from "./markers";
import { nextSiblingWithinBoundary } from "./cursor";
import { failHydration } from "./error";

export function consumeHydrationSlsot(
  currentNode: Node | null,
  boundary: Node | null,
): {
  start: Comment;
  end: Comment;
  next: Node | null;
} {
  if (!isHydrationSlotStart(currentNode)) {
    failHydration();
  }

  let depth = 1;
  let cursor = currentNode.nextSibling;

  while (cursor !== null && cursor !== boundary) {
    if (isHydrationSlotStart(cursor)) {
      depth++;
    } else if (isHydrationSlotEnd(cursor)) {
      depth--;

      if (depth === 0) {
        return {
          start: currentNode,
          end: cursor,
          next: nextSiblingWithinBoundary(cursor, boundary),
        };
      }
    }

    cursor = cursor.nextSibling;
  }

  failHydration();
}