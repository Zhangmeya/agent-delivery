import type { DndContextProps } from "@dnd-kit/core";
import type { TFunction } from "i18next";

type DndAccessibility = NonNullable<DndContextProps["accessibility"]>;

export function buildDndAccessibility(t: TFunction): DndAccessibility {
  return {
    screenReaderInstructions: {
      draggable: t("dnd.screenReaderInstructions.draggable", {
        defaultValue:
          "To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item. Press space again to drop the item in its new position, or press escape to cancel.",
      }),
    },
    announcements: {
      onDragStart({ active }) {
        return t("dnd.announcements.dragStart", {
          defaultValue: "Picked up draggable item {{id}}.",
          id: active.id,
        });
      },
      onDragOver({ active, over }) {
        if (over) {
          return t("dnd.announcements.dragOver", {
            defaultValue: "Draggable item {{id}} is over droppable area {{overId}}.",
            id: active.id,
            overId: over.id,
          });
        }
        return t("dnd.announcements.dragOverNone", {
          defaultValue: "Draggable item {{id}} is no longer over a droppable area.",
          id: active.id,
        });
      },
      onDragEnd({ active, over }) {
        if (over) {
          return t("dnd.announcements.dragEnd", {
            defaultValue: "Dropped draggable item {{id}} over droppable area {{overId}}.",
            id: active.id,
            overId: over.id,
          });
        }
        return t("dnd.announcements.dragEndNone", {
          defaultValue: "Dropped draggable item {{id}}.",
          id: active.id,
        });
      },
      onDragCancel({ active }) {
        return t("dnd.announcements.dragCancel", {
          defaultValue: "Cancelled dragging draggable item {{id}}.",
          id: active.id,
        });
      },
    },
  };
}
