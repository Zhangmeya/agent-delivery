import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentPermissions, TrustPreset } from "@penclipai/shared";
import { Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, CollapsibleSection } from "./agent-config-primitives";
import {
  buildPermissionsForTrustPreset,
  clearSingleLowTrustBoundaryTarget,
  getLowTrustBoundary,
  getSingleLowTrustBoundaryTarget,
  getTrustPreset,
  isCeLowTrustBoundaryEditable,
  lowTrustBoundaryHasScope,
  setSingleLowTrustBoundaryTarget,
  summarizeLowTrustBoundaryTarget,
  TRUST_PRESET_DESCRIPTIONS,
  TRUST_PRESET_LABELS,
  type LowTrustBoundaryTarget,
} from "../lib/trust-policy-ui";
import { cn } from "../lib/utils";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function formatCount(value: readonly unknown[] | undefined, singular: string, plural: string) {
  const count = value?.length ?? 0;
  if (count === 0) return "-";
  return `${count} ${count === 1 ? singular : plural}`;
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-right", value === "-" && "text-muted-foreground")}>{value}</span>
    </div>
  );
}

export interface LowTrustBoundaryCandidate {
  id: string;
  label: string;
}

type LowTrustBoundaryTargetType = LowTrustBoundaryTarget["type"];

const BOUNDARY_TARGET_LABELS: Record<LowTrustBoundaryTargetType, string> = {
  project: "trustPreset.boundary.project",
  root_issue: "trustPreset.boundary.rootIssue",
  issue: "trustPreset.boundary.issue",
};

export function TrustPresetSection({
  permissions,
  onChange,
  disabled,
  companyId,
  projectCandidates = [],
  issueCandidates = [],
  candidatesLoading,
}: {
  permissions: Partial<AgentPermissions> | null | undefined;
  onChange: (permissions: Partial<AgentPermissions>) => void;
  disabled?: boolean;
  companyId?: string | null;
  projectCandidates?: LowTrustBoundaryCandidate[];
  issueCandidates?: LowTrustBoundaryCandidate[];
  candidatesLoading?: boolean;
}) {
  const { t } = useTranslation();
  const [policyOpen, setPolicyOpen] = useState(false);
  const preset = getTrustPreset(permissions);
  const boundary = getLowTrustBoundary(permissions);
  const boundaryTarget = getSingleLowTrustBoundaryTarget(boundary);
  const [targetType, setTargetType] = useState<LowTrustBoundaryTargetType>(boundaryTarget?.type ?? "project");
  const lowTrust = preset === "low_trust_review";
  const hasScope = lowTrustBoundaryHasScope(boundary);
  const boundaryEditable = isCeLowTrustBoundaryEditable(boundary);
  const policy = permissions?.authorizationPolicy ?? null;
  const managedPermissions = useMemo(
    () => buildPermissionsForTrustPreset(permissions, preset),
    [permissions, preset],
  );

  useEffect(() => {
    if (boundaryTarget) setTargetType(boundaryTarget.type);
  }, [boundaryTarget?.type]);

  function handlePresetChange(value: string) {
    const nextPreset: TrustPreset = value === "low_trust_review" ? "low_trust_review" : "standard";
    onChange(buildPermissionsForTrustPreset(permissions, nextPreset));
  }

  function handleBoundaryTargetChange(targetId: string) {
    if (!companyId || !targetId) return;
    onChange(setSingleLowTrustBoundaryTarget(permissions, companyId, { type: targetType, id: targetId }));
  }

  function handleClearBoundary() {
    onChange(clearSingleLowTrustBoundaryTarget(permissions));
  }

  const targetCandidates = targetType === "project" ? projectCandidates : issueCandidates;
  const boundaryValue = boundaryTarget?.type === targetType ? boundaryTarget.id : "";

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">{t("trustPreset.title")}</h3>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <Field label={t("trustPreset.presetLabel")} hint={t("trustPreset.presetHint")}>
          <select
            className={inputClass}
            value={preset}
            onChange={(event) => handlePresetChange(event.target.value)}
            disabled={disabled}
          >
            <option value="standard">{t("trustPreset.option.standard", TRUST_PRESET_LABELS.standard)}</option>
            <option value="low_trust_review">{t("trustPreset.option.lowTrustReview", TRUST_PRESET_LABELS.low_trust_review)}</option>
          </select>
        </Field>
        <p className="text-xs text-muted-foreground">{t(`trustPreset.description.${preset}`, TRUST_PRESET_DESCRIPTIONS[preset])}</p>

        {lowTrust ? (
          <div
            role={hasScope ? "status" : "alert"}
            aria-live="polite"
            className={cn(
              "rounded-md border px-3 py-2.5 text-sm flex gap-2",
              hasScope
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-100"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {hasScope ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="font-medium">
                  {hasScope ? t("trustPreset.containmentActive") : t("trustPreset.containmentNotConfigured")}
                </p>
                <p className="mt-1 text-xs leading-5">
                  {hasScope
                    ? t("trustPreset.containmentActiveBody")
                    : t("trustPreset.containmentNotConfiguredBody")}
                </p>
              </div>
              {boundaryEditable ? (
                <div className="rounded-md border border-border/70 bg-background/70 p-3 text-foreground space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
                    <Field label={t("trustPreset.boundaryType")}>
                      <select
                        className={inputClass}
                        value={targetType}
                        onChange={(event) => setTargetType(event.target.value as LowTrustBoundaryTargetType)}
                        disabled={disabled}
                      >
                        <option value="project">{t("trustPreset.boundary.project")}</option>
                        <option value="root_issue">{t("trustPreset.boundary.rootIssue")}</option>
                        <option value="issue">{t("trustPreset.boundary.issue")}</option>
                      </select>
                    </Field>
                    <Field label={t(BOUNDARY_TARGET_LABELS[targetType])}>
                      <select
                        className={inputClass}
                        value={boundaryValue}
                        onChange={(event) => handleBoundaryTargetChange(event.target.value)}
                        disabled={disabled || !companyId || candidatesLoading || targetCandidates.length === 0}
                      >
                        <option value="">
                          {candidatesLoading
                            ? t("common.loadingEllipsis")
                            : targetCandidates.length === 0
                              ? t(targetType === "project" ? "trustPreset.noProjectsAvailable" : "trustPreset.noIssuesAvailable")
                              : t("trustPreset.selectBoundary")}
                        </option>
                        {targetCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {t("trustPreset.ceBoundaryHint")}
                    </p>
                    {boundaryTarget ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={handleClearBoundary}
                        disabled={disabled}
                      >
                        {t("trustPreset.clearBoundary")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border/70 bg-background/70 p-3 text-foreground">
                  <p className="text-sm font-medium">{t("trustPreset.managedByEeApi")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t("trustPreset.managedByEeApiBody", { summary: summarizeLowTrustBoundaryTarget(boundary).toLowerCase() })}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t("trustPreset.eePrompt")}{" "}
                <a
                  className="underline underline-offset-2 hover:text-foreground"
                  href="https://paperclip.ing/ee"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("trustPreset.getPaperclipEe")}
                </a>
              </p>
              <CollapsibleSection
                title={t("trustPreset.viewPolicy")}
                open={policyOpen}
                onToggle={() => setPolicyOpen((open) => !open)}
              >
                <div className="divide-y divide-border/60 text-foreground">
                  <PolicyRow label={t("trustPreset.policy.preset")} value={t("trustPreset.policy.lowTrustReviewV1")} />
                  <PolicyRow label={t("trustPreset.policy.rawOutput")} value={t("trustPreset.policy.quarantined")} />
                  <PolicyRow label={t("trustPreset.policy.projects")} value={formatCount(boundary?.projectIds, t("trustPreset.unit.project"), t("trustPreset.unit.projects"))} />
                  <PolicyRow label={t("trustPreset.policy.rootIssue")} value={boundary?.rootIssueId ? boundary.rootIssueId.slice(0, 8) : "-"} />
                  <PolicyRow label={t("trustPreset.policy.explicitIssues")} value={formatCount(boundary?.issueIds, t("trustPreset.unit.issue"), t("trustPreset.unit.issues"))} />
                  <PolicyRow label={t("trustPreset.policy.allowedAgents")} value={formatCount(boundary?.allowedAgentIds, t("trustPreset.unit.agent"), t("trustPreset.unit.agents"))} />
                  <PolicyRow label={t("trustPreset.policy.allowedTools")} value={boundary?.allowedToolClasses?.join(" · ") || "-"} />
                  <PolicyRow label={t("trustPreset.policy.allowedSecrets")} value={formatCount(boundary?.allowedSecretBindingIds, t("trustPreset.unit.binding"), t("trustPreset.unit.bindings"))} />
                  <PolicyRow label={t("trustPreset.policy.promotionTarget")} value={boundary?.outputPromotionTarget?.issueId?.slice(0, 8) ?? "-"} />
                  <PolicyRow
                    label={t("trustPreset.policy.eeFields")}
                    value={Object.keys(policy ?? {}).some((key) => !["trustPreset", "reviewPreset", "trustBoundary"].includes(key))
                      ? t("trustPreset.policy.customAdvancedFieldsPreserved")
                      : "-"}
                  />
                </div>
              </CollapsibleSection>
            </div>
          </div>
        ) : null}

        {managedPermissions.authorizationPolicy?.reviewPreset ? null : (
          <p className="text-xs text-muted-foreground">
            {t("trustPreset.advancedPermissionsHint")}
          </p>
        )}
      </div>
    </div>
  );
}
