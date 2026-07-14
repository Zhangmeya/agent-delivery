import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { IssueProductivityReview } from "@penclipai/shared";
import { Link } from "../lib/router";
import { cn } from "../lib/utils";
import { createIssueDetailPath } from "../lib/issueDetailBreadcrumb";
import { translateStatusLabel } from "../lib/i18n-labels";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const TRIGGER_LABELS: Record<string, { key: string; defaultValue: string }> = {
  no_comment_streak: { key: "productivityReview.trigger.noCommentStreak", defaultValue: "No-comment streak" },
  long_active_duration: { key: "productivityReview.trigger.longActiveDuration", defaultValue: "Long active duration" },
  high_churn: { key: "productivityReview.trigger.highChurn", defaultValue: "High churn" },
};

export function productivityReviewTriggerLabel(
  trigger: IssueProductivityReview["trigger"],
  t?: TFunction,
): string {
  const fallback = "Productivity review";
  if (!trigger) {
    return t ? t("productivityReview.label", { defaultValue: fallback }) : fallback;
  }
  const entry = TRIGGER_LABELS[trigger];
  if (!entry) return t ? t("productivityReview.label", { defaultValue: fallback }) : fallback;
  return t ? t(entry.key, { defaultValue: entry.defaultValue }) : entry.defaultValue;
}

export function ProductivityReviewBadge({
  review,
  className,
  hideLabel = false,
}: {
  review: IssueProductivityReview;
  className?: string;
  hideLabel?: boolean;
}) {
  const { t } = useTranslation(undefined, { useSuspense: false });
  const label = productivityReviewTriggerLabel(review.trigger, t);
  const reviewIdentifier = review.reviewIdentifier ?? review.reviewIssueId.slice(0, 8);
  const reviewPath = createIssueDetailPath(review.reviewIdentifier ?? review.reviewIssueId);
  const statusLabel = review.status === "todo" || review.status === "backlog"
    ? t("productivityReview.status.open", { defaultValue: "Open" })
    : translateStatusLabel(t, review.status);
  const badgeLabel = t("productivityReview.underReview", { defaultValue: "Under review" });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={reviewPath}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-(length:--text-nano) font-medium text-amber-700 dark:text-amber-300 shrink-0 hover:bg-amber-500/20 transition-colors",
            className,
          )}
          aria-label={t("productivityReview.badgeAria", {
            defaultValue: "Under review - productivity review {{identifier}} ({{label}})",
            identifier: reviewIdentifier,
            label,
          })}
        >
          <Eye className="h-3 w-3" aria-hidden />
          {hideLabel ? null : <span>{badgeLabel}</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1 text-xs">
          <div className="font-semibold">
            {t("productivityReview.openTitle", { defaultValue: "Productivity review open" })}
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("productivityReview.triggerLabel", { defaultValue: "Trigger:" })}
            </span>{" "}
            {label}
          </div>
          {typeof review.noCommentStreak === "number" && review.noCommentStreak > 0 ? (
            <div>
              <span className="text-muted-foreground">
                {t("productivityReview.noCommentStreakLabel", { defaultValue: "No-comment streak:" })}
              </span>{" "}
              {t("productivityReview.runCount", {
                count: review.noCommentStreak,
                defaultValue: "{{count}} runs",
              })}
            </div>
          ) : null}
          <div>
            <span className="text-muted-foreground">
              {t("productivityReview.reviewLabel", { defaultValue: "Review:" })}
            </span>{" "}
            {reviewIdentifier} ({statusLabel})
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
