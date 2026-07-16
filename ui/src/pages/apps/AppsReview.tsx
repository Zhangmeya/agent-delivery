import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { ReviewQueueCard } from "./ReviewQueueCard";

/**
 * Review — the "decisions waiting on you" inbox (PAP-12371, Finding B).
 *
 * Ask-first approvals used to live only inside the "Needs attention" page,
 * folded together with health/error triage. That buried the one thing a user
 * must act on for their agents to proceed. This is the explicit, top-level
 * home for those approvals, aligned with the Inbox "waiting for your OK"
 * language from the approved PAP-11178 gateway UX. Health issues stay on
 * "Needs attention"; decisions live here.
 */
export function AppsReview() {
  const { t } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("apps.common.company", { defaultValue: "Company" }), href: "/dashboard" },
      { label: t("apps.common.apps", { defaultValue: "Apps" }), href: "/apps" },
      { label: t("apps.sidebar.review", { defaultValue: "Review" }) },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, selectedCompany?.name, t]);

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("apps.review.selectCompany", { defaultValue: "Select a company to review approvals." })}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("apps.sidebar.review", { defaultValue: "Review" })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("apps.review.description", {
            defaultValue: "Actions your agents want to run that need your OK first. Approve, always-allow, or decline.",
          })}
        </p>
      </header>

      <ReviewQueueCard
        emptyState="reassure"
        heading={t("apps.review.waitingForApproval", { defaultValue: "Waiting for your OK" })}
      />
    </div>
  );
}
