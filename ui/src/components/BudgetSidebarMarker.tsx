import { DollarSign } from "lucide-react";
import { useTranslation } from "react-i18next";

export type BudgetSidebarMarkerLevel = "healthy" | "warning" | "critical";

const levelClasses: Record<BudgetSidebarMarkerLevel, string> = {
  healthy: "bg-emerald-500/90 text-white",
  warning: "bg-amber-500/95 text-amber-950",
  critical: "bg-red-500/90 text-white",
};

const defaultTitleKeys: Record<BudgetSidebarMarkerLevel, { key: string; defaultValue: string }> = {
  healthy: { key: "budgetSidebarMarker.healthy", defaultValue: "Budget healthy" },
  warning: { key: "budgetSidebarMarker.warning", defaultValue: "Budget warning" },
  critical: { key: "budgetSidebarMarker.critical", defaultValue: "Paused by budget" },
};

export function BudgetSidebarMarker({
  title,
  level = "critical",
}: {
  title?: string;
  level?: BudgetSidebarMarkerLevel;
}) {
  const { t } = useTranslation();
  const titleCopy = defaultTitleKeys[level];
  const accessibleTitle = title ?? t(titleCopy.key, { defaultValue: titleCopy.defaultValue });

  return (
    <span
      title={accessibleTitle}
      aria-label={accessibleTitle}
      className={`ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full shadow-(--shadow-extract-3) ${levelClasses[level]}`}
    >
      <DollarSign className="h-3 w-3" />
    </span>
  );
}
