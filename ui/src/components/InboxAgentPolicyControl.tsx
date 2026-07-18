import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, LoaderCircle, Save } from "lucide-react";
import type { InboxAgentPolicy, InboxAgentPolicyMode } from "@penclipai/shared";
import { agentsApi } from "@/api/agents";
import { inboxAgentPolicyApi } from "@/api/inbox-agent-policy";
import { queryKeys } from "@/lib/queryKeys";
import { isAgentTaskTarget } from "@/lib/company-members";
import { AgentIcon } from "./AgentIconPicker";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RadioCardGroup, type RadioCardOption } from "@/components/ui/radio-card";

const MODE_OPTIONS = [
  {
    value: "open",
    titleKey: "inboxAgentPolicy.mode.open.title",
    titleDefault: "Any of my agents",
    descriptionKey: "inboxAgentPolicy.mode.open.description",
    descriptionDefault: "Let any agent you manage archive tasks out of your inbox.",
  },
  {
    value: "allowlist",
    titleKey: "inboxAgentPolicy.mode.allowlist.title",
    titleDefault: "Only chosen agents",
    descriptionKey: "inboxAgentPolicy.mode.allowlist.description",
    descriptionDefault: "Restrict inbox tidying to the agents you pick below.",
  },
  {
    value: "disabled",
    titleKey: "inboxAgentPolicy.mode.disabled.title",
    titleDefault: "Off",
    descriptionKey: "inboxAgentPolicy.mode.disabled.description",
    descriptionDefault: "Agents can never archive tasks from your inbox.",
  },
] as const;

function policyKey(mode: InboxAgentPolicyMode, allowedAgentIds: string[]): string {
  return `${mode}:${[...allowedAgentIds].sort().join(",")}`;
}

interface Draft {
  mode: InboxAgentPolicyMode;
  allowedAgentIds: string[];
}

/**
 * "Let agents tidy my inbox" user-settings control. A single
 * three-state policy — `open` / `allowlist` / `disabled` — round-tripped through
 * the per-user endpoints. When `allowlist` is selected the user picks which
 * of their agents may archive. The one-click Undo/Unarchive affordance and the
 * "Archived by …" attribution live elsewhere (inbox rows / properties pane).
 */
export function InboxAgentPolicyControl({ companyId }: { companyId: string | null | undefined }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const lastServerKeyRef = useRef<string | null>(null);

  const policyQuery = useQuery({
    queryKey: companyId ? queryKeys.inboxAgentPolicy.mine(companyId) : ["inbox-agent-policy", "none"],
    queryFn: () => inboxAgentPolicyApi.getMine(companyId!),
    enabled: !!companyId,
  });
  const policy = policyQuery.data;

  const agentsQuery = useQuery({
    queryKey: companyId ? queryKeys.agents.list(companyId) : ["agents", "none"],
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });
  const selectableAgents = useMemo(
    () => (agentsQuery.data ?? []).filter(isAgentTaskTarget),
    [agentsQuery.data],
  );
  const modeOptions = useMemo<RadioCardOption[]>(
    () => MODE_OPTIONS.map((option) => ({
      value: option.value,
      title: t(option.titleKey, { defaultValue: option.titleDefault }),
      description: t(option.descriptionKey, { defaultValue: option.descriptionDefault }),
    })),
    [t],
  );

  // Adopt server state on first load, or on refetch when the user has not
  // diverged from the previously-synced snapshot (so a background refetch never
  // clobbers pending edits).
  useEffect(() => {
    if (!policy) return;
    const serverKey = policyKey(policy.mode, policy.allowedAgentIds);
    setDraft((current) => {
      if (current === null || policyKey(current.mode, current.allowedAgentIds) === lastServerKeyRef.current) {
        return { mode: policy.mode, allowedAgentIds: policy.allowedAgentIds };
      }
      return current;
    });
    lastServerKeyRef.current = serverKey;
  }, [policy]);

  const updateMutation = useMutation({
    mutationFn: (next: Draft) =>
      inboxAgentPolicyApi.updateMine(companyId!, {
        mode: next.mode,
        allowedAgentIds: next.mode === "allowlist" ? next.allowedAgentIds : [],
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData<InboxAgentPolicy>(queryKeys.inboxAgentPolicy.mine(companyId!), saved);
    },
  });

  const isDirty = Boolean(
    draft && policy && policyKey(draft.mode, draft.allowedAgentIds) !== policyKey(policy.mode, policy.allowedAgentIds),
  );

  if (policyQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {policyQuery.error instanceof Error
          ? policyQuery.error.message
          : t("inboxAgentPolicy.loadFailed", { defaultValue: "Failed to load inbox agent policy." })}
      </div>
    );
  }

  if (policyQuery.isLoading || !draft) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("inboxAgentPolicy.loading", { defaultValue: "Loading inbox agent policy..." })}
      </div>
    );
  }

  const toggleAgent = (agentId: string, checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const set = new Set(current.allowedAgentIds);
      if (checked) set.add(agentId);
      else set.delete(agentId);
      return { ...current, allowedAgentIds: [...set] };
    });
  };

  return (
    <section
      className="space-y-4"
      aria-label={t("inboxAgentPolicy.title", { defaultValue: "Let agents tidy my inbox" })}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">
            {t("inboxAgentPolicy.title", { defaultValue: "Let agents tidy my inbox" })}
          </h2>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("inboxAgentPolicy.description", {
            defaultValue: "Choose whether the agents you manage may archive tasks out of your inbox on your behalf. You can undo any archive, and every agent archive is attributed in the task's properties.",
          })}
        </p>
      </div>

      <RadioCardGroup
        ariaLabel={t("inboxAgentPolicy.ariaLabel", { defaultValue: "Inbox agent archiving policy" })}
        value={draft.mode}
        onValueChange={(value) => setDraft((current) => (current ? { ...current, mode: value as InboxAgentPolicyMode } : current))}
        options={modeOptions}
        className="max-w-2xl"
      />

      {draft.mode === "allowlist" ? (
        <div className="max-w-2xl space-y-2 rounded-md border border-border p-3">
          <div className="text-sm font-medium">
            {t("inboxAgentPolicy.allowedAgents", { defaultValue: "Agents allowed to tidy my inbox" })}
          </div>
          {selectableAgents.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("inboxAgentPolicy.noAgents", { defaultValue: "You don't manage any agents yet." })}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {selectableAgents.map((agent) => {
                const checked = draft.allowedAgentIds.includes(agent.id);
                return (
                  <li key={agent.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/40">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => toggleAgent(agent.id, next === true)}
                        aria-label={t("inboxAgentPolicy.allowAgentAriaLabel", {
                          defaultValue: "Allow {{name}} to tidy my inbox",
                          name: agent.name,
                        })}
                      />
                      <AgentIcon icon={agent.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate text-sm">{agent.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{agent.role}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {updateMutation.error ? (
        <div className="max-w-2xl rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {updateMutation.error instanceof Error
            ? updateMutation.error.message
            : t("inboxAgentPolicy.saveFailed", { defaultValue: "Failed to save inbox agent policy." })}
        </div>
      ) : null}

      <div className="flex max-w-2xl items-center justify-end gap-3">
        {updateMutation.isSuccess && !isDirty ? (
          <span className="text-xs text-muted-foreground" role="status">
            {t("common.saved", { defaultValue: "Saved" })}
          </span>
        ) : null}
        <Button
          type="button"
          disabled={!isDirty || updateMutation.isPending}
          onClick={() => draft && updateMutation.mutate(draft)}
        >
          {updateMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          {updateMutation.isPending
            ? t("common.saving", { defaultValue: "Saving..." })
            : t("common.save", { defaultValue: "Save" })}
        </Button>
      </div>
    </section>
  );
}
