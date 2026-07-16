import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ToolProfileWithDetails } from "@penclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ProfileActionDialogKind = "archive" | "delete" | "restore";

export function ProfileActionDialog({
  kind,
  profile,
  pending,
  onClose,
  onArchive,
  onRestore,
  onDelete,
}: {
  kind: ProfileActionDialogKind | null;
  profile: ToolProfileWithDetails | null;
  pending: boolean;
  onClose: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  if (!kind || !profile) return null;

  const defaultDeleteBlocked = kind === "delete" && profile.summary.isCompanyDefault;
  const copy = {
    archive: {
      title: t("tools.profiles.actions.archive.title", { defaultValue: "Archive profile" }),
      body: t(
        profile.summary.appliesToAgentCount === 1
          ? "tools.profiles.actions.archive.bodyOne"
          : "tools.profiles.actions.archive.bodyMany",
        {
          defaultValue:
            profile.summary.appliesToAgentCount === 1
              ? "This profile stops applying to 1 agent. You can restore it later."
              : "This profile stops applying to {{count}} agents. You can restore it later.",
          count: profile.summary.appliesToAgentCount,
        },
      ),
      confirm: t("tools.profiles.actions.archive.confirm", { defaultValue: "Archive" }),
      action: onArchive,
    },
    restore: {
      title: t("tools.profiles.actions.restore.title", { defaultValue: "Restore profile" }),
      body: t("tools.profiles.actions.restore.body", { defaultValue: "This profile will be active again and can be assigned to agents." }),
      confirm: t("tools.profiles.actions.restore.confirm", { defaultValue: "Restore" }),
      action: onRestore,
    },
    delete: {
      title: t("tools.profiles.actions.delete.title", { defaultValue: "Delete profile" }),
      body: defaultDeleteBlocked
        ? t("tools.profiles.actions.delete.defaultBlocked", { defaultValue: "This profile is the company default. Reassign the company default to another profile before deleting it." })
        : t(
            profile.summary.assignmentCount === 1
              ? "tools.profiles.actions.delete.bodyOne"
              : "tools.profiles.actions.delete.bodyMany",
            {
              defaultValue:
                profile.summary.assignmentCount === 1
                  ? "This permanently deletes the profile and removes 1 assignment."
                  : "This permanently deletes the profile and removes {{count}} assignments.",
              count: profile.summary.assignmentCount,
            },
          ),
      confirm: t("tools.profiles.actions.delete.confirm", { defaultValue: "Delete" }),
      action: onDelete,
    },
  }[kind];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {defaultDeleteBlocked ? (
          <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("tools.profiles.actions.delete.chooseDefaultFirst", { defaultValue: "Choose another access profile and make it the company default first." })}</span>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("tools.common.cancel", { defaultValue: "Cancel" })}</Button>
          <Button
            variant={kind === "delete" ? "destructive" : "default"}
            disabled={pending || defaultDeleteBlocked}
            onClick={copy.action}
          >
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
