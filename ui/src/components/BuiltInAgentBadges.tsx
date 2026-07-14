import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { brandChipBadge } from "@/lib/status-colors";
import type { BuiltInAgentStatus } from "@/api/builtInAgents";
import { useTranslation } from "react-i18next";

/**
 * Provenance label ("Built-in"). Constant for the life of a built-in agent —
 * this is NOT a lifecycle/status chip, so it never routes through
 * `StatusBadge`/`AgentStatusBadge` (ux-spec D2).
 */
export function BuiltInAgentBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn(
        brandChipBadge.blue,
        compact && "px-1.5 py-0 text-(length:--text-nano)",
        className,
      )}
      title={t("builtInAgents.badge.tooltip", {
        defaultValue: "Ships with Paperclip CN",
      })}
    >
      {t("builtInAgents.badge.label", { defaultValue: "Built-in" })}
    </Badge>
  );
}

/**
 * Derived lifecycle chip. Rendered for the amber attention states
 * (`needs_setup`, `pending_approval`). Kept separate from the real agent status
 * (`idle/active/…`) per ux-spec D1.
 */
export function BuiltInLifecycleChip({
  status,
  compact = false,
  className,
}: {
  status: BuiltInAgentStatus;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (status !== "needs_setup" && status !== "pending_approval") return null;
  const isPendingApproval = status === "pending_approval";
  return (
    <Badge
      variant="outline"
      className={cn(
        brandChipBadge.amber,
        compact && "px-1.5 py-0 text-(length:--text-nano)",
        className,
      )}
      title={
        isPendingApproval
          ? t("builtInAgents.lifecycle.pendingApprovalTooltip", {
              defaultValue:
                "Waiting on board hire approval before the feature can run",
            })
          : t("builtInAgents.lifecycle.needsSetupTooltip", {
              defaultValue:
                "Needs adapter/model setup before the feature can run",
            })
      }
    >
      {isPendingApproval
        ? compact
          ? t("builtInAgents.lifecycle.approvalCompact", {
              defaultValue: "Approval",
            })
          : t("builtInAgents.lifecycle.pendingApproval", {
              defaultValue: "Pending approval",
            })
        : compact
          ? t("builtInAgents.lifecycle.setupCompact", { defaultValue: "Setup" })
          : t("builtInAgents.lifecycle.needsSetup", {
              defaultValue: "Needs setup",
            })}
    </Badge>
  );
}
