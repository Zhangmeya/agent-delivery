import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/agent-config-primitives";
import {
  AdapterTypeDropdown,
  ModelDropdown,
} from "@/components/AgentConfigForm";
import { InlineBanner } from "@/components/InlineBanner";
import { listAdapterOptions } from "@/adapters/metadata";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { ApiError } from "@/api/client";
import {
  builtInAgentsApi,
  type BuiltInAgentDefinition,
  type BuiltInAgentState,
} from "@/api/builtInAgents";

function builtInAgentDisplayName(
  definition: BuiltInAgentDefinition,
  t: TFunction,
): string {
  switch (definition.key) {
    case "briefs":
      return t("builtInAgents.definitions.briefs.displayName", {
        defaultValue: "Briefs Agent",
      });
    case "learning":
      return t("builtInAgents.definitions.learning.displayName", {
        defaultValue: "Learning Agent",
      });
    case "reflection-coach":
      return t("builtInAgents.definitions.reflectionCoach.displayName", {
        defaultValue: "Reflection Coach",
      });
    default:
      return definition.displayName;
  }
}

function builtInAgentShortPurpose(
  definition: BuiltInAgentDefinition,
  t: TFunction,
): string {
  switch (definition.key) {
    case "briefs":
      return t("builtInAgents.definitions.briefs.shortPurpose", {
        defaultValue:
          "Prepares concise operational briefs for the board and agent company.",
      });
    case "learning":
      return t("builtInAgents.definitions.learning.shortPurpose", {
        defaultValue:
          "Maintains reusable company learning from completed work and recurring patterns.",
      });
    case "reflection-coach":
      return t("builtInAgents.definitions.reflectionCoach.shortPurpose", {
        defaultValue:
          "Runs evidence-backed reflection loops on recent agent work, proposes small instruction and skill improvements, and requests approval before changes are applied.",
      });
    default:
      return definition.shortPurpose;
  }
}

/** Adapters whose config completeness is keyed on a non-empty `model`. */
function isModelBasedAdapter(adapterType: string): boolean {
  return ![
    "process",
    "command",
    "http",
    "openclaw_gateway",
    "hermes_gateway",
  ].includes(adapterType);
}

function defaultAdapterType(state: BuiltInAgentState): string {
  return state.definition.allowedAdapterTypes?.[0] ?? "codex_local";
}

function parseBudgetMonthlyCents(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const cents = Math.round(Number(trimmed) * 100);
  return Number.isFinite(cents) && cents >= 0 ? cents : undefined;
}

export interface ConfigureBuiltInAgentModalProps {
  companyId: string;
  state: BuiltInAgentState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful provision (e.g. to navigate to the agent). */
  onConfigured?: (result: BuiltInAgentState) => void;
}

/**
 * Configure-on-first-use modal for a built-in agent. Reuses the shared
 * `AdapterTypeDropdown` + `ModelDropdown` (ux-spec D6 — no second model picker),
 * plus an optional monthly budget, and submits to the provision endpoint.
 */
export function ConfigureBuiltInAgentModal({
  companyId,
  state,
  open,
  onOpenChange,
  onConfigured,
}: ConfigureBuiltInAgentModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { definition } = state;
  const displayName = builtInAgentDisplayName(definition, t);
  const shortPurpose = builtInAgentShortPurpose(definition, t);

  const [adapterType, setAdapterType] = useState<string>(
    () => state.agent?.adapterType ?? defaultAdapterType(state),
  );
  const [model, setModel] = useState<string>(() => {
    const config = state.agent?.adapterConfig;
    return typeof config === "object" &&
      config !== null &&
      typeof (config as Record<string, unknown>).model === "string"
      ? ((config as Record<string, unknown>).model as string)
      : "";
  });
  const [modelOpen, setModelOpen] = useState(false);
  const [budgetDollars, setBudgetDollars] = useState<string>(() => {
    const cents = definition.defaultBudgetMonthlyCents ?? 0;
    return cents > 0 ? String(cents / 100) : "";
  });
  const [error, setError] = useState<string | null>(null);

  // Restrict adapter choices to the registry's allow-list. Non-model adapters
  // are still selectable: provisioning creates the row, then full agent config
  // collects command/endpoint fields while the built-in remains `needs_setup`.
  const disabledTypes = useMemo(() => {
    const allowed = new Set(definition.allowedAdapterTypes ?? []);
    return new Set(
      listAdapterOptions()
        .map((option) => option.value)
        .filter((value) => allowed.size > 0 && !allowed.has(value)),
    );
  }, [definition.allowedAdapterTypes]);

  const setupSupportedInModal = isModelBasedAdapter(adapterType);

  const { data: fetchedModels } = useQuery({
    queryKey: queryKeys.agents.adapterModels(companyId, adapterType, null),
    queryFn: () => agentsApi.adapterModels(companyId, adapterType, {}),
    enabled: open && Boolean(companyId) && setupSupportedInModal,
  });
  const models = fetchedModels ?? [];

  const modelRequired = setupSupportedInModal;
  const budgetMonthlyCents = parseBudgetMonthlyCents(budgetDollars);
  const budgetValid = !budgetDollars.trim() || budgetMonthlyCents !== undefined;
  const canSubmit =
    budgetValid &&
    (setupSupportedInModal ? !modelRequired || model.trim().length > 0 : true);
  const submitLabel = setupSupportedInModal
    ? t("builtInAgents.configure.configureAndEnable", {
        defaultValue: "Configure & enable {{name}}",
        name: displayName,
      })
    : t("builtInAgents.configure.provision", {
        defaultValue: "Provision {{name}}",
        name: displayName,
      });

  const provision = useMutation({
    mutationFn: async () => {
      const adapterConfig: Record<string, unknown> = {};
      if (model.trim()) adapterConfig.model = model.trim();
      const result = await builtInAgentsApi.provision(
        companyId,
        definition.key,
        {
          adapterType,
          adapterConfig,
          ...(budgetMonthlyCents !== undefined ? { budgetMonthlyCents } : {}),
        },
      );
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.builtInAgents.list(companyId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(companyId),
      });
      if (result.agentId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.detail(result.agentId),
        });
      }
      onConfigured?.(result);
      onOpenChange(false);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : t("builtInAgents.configure.failed", {
              defaultValue: "Failed to configure the built-in agent.",
            }),
      );
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) =>
        provision.isPending ? undefined : onOpenChange(next)
      }
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("builtInAgents.configure.title", {
              defaultValue: "Set up the {{name}}",
              name: displayName,
            })}
          </DialogTitle>
          <DialogDescription>{shortPurpose}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <InlineBanner tone="info" compact>
            {t("builtInAgents.configure.rosterNotice", {
              defaultValue:
                "Creates {{name}} in your roster with a Built-in badge. Companies that require hire approval will queue this for the board.",
              name: displayName,
            })}
          </InlineBanner>

          <Field
            label={t("builtInAgents.configure.adapterType", {
              defaultValue: "Adapter type",
            })}
          >
            <AdapterTypeDropdown
              value={adapterType}
              onChange={(next) => {
                setAdapterType(next);
                setModel("");
              }}
              disabledTypes={disabledTypes}
            />
          </Field>

          {modelRequired && (
            // ModelDropdown supplies its own "Model" Field label + hint.
            <ModelDropdown
              models={models}
              value={model}
              onChange={setModel}
              open={modelOpen}
              onOpenChange={setModelOpen}
              allowDefault={adapterType !== "opencode_local"}
              required
              groupByProvider={false}
              creatable
            />
          )}

          {!setupSupportedInModal && (
            <InlineBanner tone="warning" compact>
              {t("builtInAgents.configure.additionalFieldsRequired", {
                defaultValue:
                  "This adapter needs command or endpoint fields before it can run. Provision the built-in row now, then finish those fields from the full agent configuration.",
              })}
            </InlineBanner>
          )}

          <Field
            label={t("builtInAgents.configure.monthlyBudget", {
              defaultValue: "Monthly budget (optional)",
            })}
            hint={t("builtInAgents.configure.monthlyBudgetHint", {
              defaultValue: "Leave blank for no cap.",
            })}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                placeholder="0"
                value={budgetDollars}
                onChange={(event) => setBudgetDollars(event.target.value)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">
                {t("builtInAgents.configure.perMonth", {
                  defaultValue: "/ month",
                })}
              </span>
            </div>
          </Field>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={provision.isPending}
          >
            {t("builtInAgents.configure.notNow", { defaultValue: "Not now" })}
          </Button>
          <Button
            onClick={() => {
              setError(null);
              provision.mutate();
            }}
            disabled={!canSubmit || provision.isPending}
          >
            {provision.isPending
              ? t("builtInAgents.configure.configuring", {
                  defaultValue: "Configuring…",
                })
              : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
