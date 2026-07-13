import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

interface ShortcutEntry {
  keys: string[];
  labelKey: string;
  defaultLabel: string;
  /** Render keys as a simultaneous chord (joined with "+") rather than a
   *  "then" sequence. */
  combo?: boolean;
}

// Platform-appropriate label for the Cmd/Ctrl modifier so the cheatsheet shows
// the same key the user actually presses (re-pointed in the collapsible sidebar
// work — Cmd/Ctrl+B toggles the rail).
function getPlatformLabel() {
  if (typeof navigator === "undefined") return "";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || navigator.userAgent || "";
}

const META_KEY = /Mac|iPhone|iPad|iPod/.test(getPlatformLabel()) ? "⌘" : "Ctrl";

interface ShortcutSection {
  titleKey: string;
  defaultTitle: string;
  shortcuts: ShortcutEntry[];
}

const sections: ShortcutSection[] = [
  {
    titleKey: "keyboardShortcuts.section.inbox",
    defaultTitle: "Inbox",
    shortcuts: [
      { keys: ["j"], labelKey: "keyboardShortcuts.moveDown", defaultLabel: "Move down" },
      { keys: ["↓"], labelKey: "keyboardShortcuts.moveDown", defaultLabel: "Move down" },
      { keys: ["k"], labelKey: "keyboardShortcuts.moveUp", defaultLabel: "Move up" },
      { keys: ["↑"], labelKey: "keyboardShortcuts.moveUp", defaultLabel: "Move up" },
      { keys: ["←"], labelKey: "keyboardShortcuts.collapseSelectedGroup", defaultLabel: "Collapse selected group" },
      { keys: ["→"], labelKey: "keyboardShortcuts.expandSelectedGroup", defaultLabel: "Expand selected group" },
      { keys: ["Enter"], labelKey: "keyboardShortcuts.openSelectedItem", defaultLabel: "Open selected item" },
      { keys: ["a"], labelKey: "keyboardShortcuts.archiveItem", defaultLabel: "Archive item" },
      { keys: ["y"], labelKey: "keyboardShortcuts.archiveItem", defaultLabel: "Archive item" },
      { keys: ["r"], labelKey: "keyboardShortcuts.markAsRead", defaultLabel: "Mark as read" },
      { keys: ["U"], labelKey: "keyboardShortcuts.markAsUnread", defaultLabel: "Mark as unread" },
    ],
  },
  {
    titleKey: "keyboardShortcuts.section.taskDetail",
    defaultTitle: "Task detail",
    shortcuts: [
      { keys: ["y"], labelKey: "keyboardShortcuts.quickArchiveBackToInbox", defaultLabel: "Quick-archive back to inbox" },
      { keys: ["g", "i"], labelKey: "keyboardShortcuts.goToInbox", defaultLabel: "Go to inbox" },
      { keys: ["g", "c"], labelKey: "keyboardShortcuts.focusCommentComposer", defaultLabel: "Focus comment composer" },
    ],
  },
  {
    titleKey: "keyboardShortcuts.section.global",
    defaultTitle: "Global",
    shortcuts: [
      { keys: ["/"], labelKey: "keyboardShortcuts.searchCurrentPage", defaultLabel: "Search current page or quick search" },
      { keys: ["c"], labelKey: "keyboardShortcuts.newTask", defaultLabel: "New task" },
      { keys: ["["], labelKey: "keyboardShortcuts.toggleSidebar", defaultLabel: "Toggle sidebar" },
      { keys: [META_KEY, "B"], labelKey: "keyboardShortcuts.collapseOrExpandSidebar", defaultLabel: "Collapse or expand sidebar", combo: true },
      { keys: ["]"], labelKey: "keyboardShortcuts.togglePanel", defaultLabel: "Toggle panel" },
      { keys: ["?"], labelKey: "keyboardShortcuts.showKeyboardShortcuts", defaultLabel: "Show keyboard shortcuts" },
    ],
  },
];

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground shadow-(--shadow-extract-10)">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsCheatsheetContent() {
  const { t } = useTranslation();
  return (
    <>
      <div className="divide-y divide-border border-t border-border">
        {sections.map((section) => (
          <div key={section.titleKey} className="px-5 py-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t(section.titleKey, { defaultValue: section.defaultTitle })}
            </h3>
            <div className="space-y-1.5">
              {section.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.labelKey + shortcut.keys.join()}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-sm text-foreground/90">{t(shortcut.labelKey, { defaultValue: shortcut.defaultLabel })}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, i) => (
                      <span key={key} className="flex items-center gap-1">
                        {i > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {shortcut.combo ? "+" : t("keyboardShortcuts.then", { defaultValue: "then" })}
                          </span>
                        )}
                        <KeyCap>{key}</KeyCap>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {t("keyboardShortcuts.pressEscPrefix", { defaultValue: "Press" })} <KeyCap>Esc</KeyCap> {t("keyboardShortcuts.closeAndDisabledHint", { defaultValue: "to close - Shortcuts are disabled in text fields" })}
        </p>
      </div>
    </>
  );
}

export function KeyboardShortcutsCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">{t("keyboardShortcuts.title", { defaultValue: "Keyboard shortcuts" })}</DialogTitle>
        </DialogHeader>
        <KeyboardShortcutsCheatsheetContent />
      </DialogContent>
    </Dialog>
  );
}
