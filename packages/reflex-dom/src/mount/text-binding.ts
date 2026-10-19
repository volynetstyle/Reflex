import type { Namespace } from "../host/namespace";
import {
  isEmptyRenderableValue,
  isTextRenderableValue,
} from "../renderable/kind";
import { getDOMContext } from "../runtime/context";
import {
  createDOMOwnedBinding,
  registerDOMCleanup,
} from "../runtime/lifetime";
import type { ContentSlot } from "../structure/content-slot";
import { createMountedSlot } from "./slot";

/**
 * Mounts a reactive child of an element.
 *
 * While the accessor yields text (or nothing), the child is one Text node
 * updated in place: no anchors, no slot controller, one read per run. The
 * first value that is not text replaces the Text node with a content slot,
 * which takes over all later values.
 *
 * Only for children of an element: the Text node is replaced when the content
 * becomes structural, so it must not be a boundary another region tracks
 * (`For` rows and slots mount their top-level content into fragments).
 */
export function mountElementChildAccessor(
  parent: Element,
  read: () => unknown,
  ns: Namespace,
  doc: Document,
): void {
  const context = getDOMContext();
  let text: Text | null = null;
  let current = "";
  let slot: ContentSlot | null = null;

  createDOMOwnedBinding(
    read,
    (value) => {
      if (slot !== null) {
        slot.update(value);
        return;
      }

      if (isTextRenderableValue(value) || isEmptyRenderableValue(value)) {
        const next = isTextRenderableValue(value) ? String(value) : "";

        if (text === null) {
          text = doc.createTextNode(next);
          parent.appendChild(text);
        } else if (next !== current) {
          text.data = next;
        }

        current = next;
        return;
      }

      slot = createMountedSlot(value, ns, doc);

      if (text === null) {
        parent.appendChild(slot.fragment);
      } else {
        text.parentNode?.replaceChild(slot.fragment, text);
        text = null;
      }
    },
    context,
  );

  registerDOMCleanup(() => {
    if (slot !== null) {
      slot.destroy();
    } else if (text?.isConnected) {
      // A detached text node went away with an ancestor that the owning
      // region removed (a row, a slot's content): nothing left to undo.
      text.parentNode!.removeChild(text);
    }
  }, context);
}
