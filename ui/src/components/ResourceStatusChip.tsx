import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { brandChipBadge, type BrandChipColor } from "@/lib/status-colors";

/**
 * The load-bearing visual grammar for the built-in bundle status panel
 * (Reflection Coach — [PAP-13099], ux-spec §4). Each variant double-encodes
 * state as glyph + word + color so it never relies on color alone
 * (WCAG 1.4.1). Colors route through the shared `brandChipBadge` families — no
 * bespoke tints are minted here (ux-spec §10).
 *
 * A single resource shows at most one readiness chip and at most one drift
 * chip; when both a readiness problem and a drift state coexist, the caller
 * suppresses the drift chip until readiness is `ready` (ux-spec §4).
 */
export type ResourceStatusVariant =
  | "ready"
  | "needs_setup"
  | "missing"
  | "error"
  | "update_available"
  | "drifted"
  | "schedule_off"
  | "schedule_on"
  | "pending_approval"
  | "proposal_pending";

interface VariantSpec {
  color: BrandChipColor;
  glyph: string;
  labelKey: string;
  titleKey: string;
}

const VARIANTS: Record<ResourceStatusVariant, VariantSpec> = {
  ready: { color: "green", glyph: "●", labelKey: "resourceStatus.ready", titleKey: "resourceStatus.readyTitle" },
  needs_setup: { color: "amber", glyph: "⚠", labelKey: "resourceStatus.needsSetup", titleKey: "resourceStatus.needsSetupTitle" },
  missing: { color: "amber", glyph: "⚠", labelKey: "resourceStatus.missing", titleKey: "resourceStatus.missingTitle" },
  error: { color: "red", glyph: "✕", labelKey: "resourceStatus.error", titleKey: "resourceStatus.errorTitle" },
  update_available: {
    color: "blue",
    glyph: "↑",
    labelKey: "resourceStatus.updateAvailable",
    titleKey: "resourceStatus.updateAvailableTitle",
  },
  drifted: {
    color: "gray",
    glyph: "✎",
    labelKey: "resourceStatus.drifted",
    titleKey: "resourceStatus.driftedTitle",
  },
  schedule_off: {
    color: "gray",
    glyph: "◌",
    labelKey: "resourceStatus.scheduleOff",
    titleKey: "resourceStatus.scheduleOffTitle",
  },
  schedule_on: { color: "green", glyph: "●", labelKey: "resourceStatus.weekly", titleKey: "resourceStatus.weeklyTitle" },
  pending_approval: {
    color: "amber",
    glyph: "⚠",
    labelKey: "resourceStatus.pendingApproval",
    titleKey: "resourceStatus.pendingApprovalTitle",
  },
  proposal_pending: {
    color: "blue",
    glyph: "↑",
    labelKey: "resourceStatus.proposalPending",
    titleKey: "resourceStatus.proposalPendingTitle",
  },
};

export function ResourceStatusChip({
  variant,
  label,
  compact = false,
  className,
}: {
  variant: ResourceStatusVariant;
  /** Override the default label (e.g. "Weekly · Mon 09:00 UTC"). */
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const spec = VARIANTS[variant];
  return (
    <Badge
      variant="outline"
      className={cn(
        brandChipBadge[spec.color],
        "font-medium",
        compact && "px-1.5 py-0 text-(length:--text-nano)",
        className,
      )}
      title={t(spec.titleKey)}
    >
      <span aria-hidden="true">{spec.glyph}</span>
      {label ?? t(spec.labelKey)}
    </Badge>
  );
}
