import type { AdapterConfigFieldsProps } from "../types";
import { useTranslation } from "react-i18next";
import {
  Field,
  ToggleField,
  DraftInput,
  DraftNumberInput,
  help,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { LocalWorkspaceRuntimeFields } from "../local-workspace-runtime-fields";
import {
  CODEX_LOCAL_FAST_MODE_SUPPORTED_MODELS,
  isCodexLocalFastModeSupported,
  isCodexLocalManualModel,
} from "@penclipai/adapter-codex-local";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime. Note: Codex may still auto-apply repo-scoped AGENTS.md files from the workspace.";

export function CodexLocalConfigFields({
  mode,
  isCreate,
  adapterType,
  values,
  set,
  config,
  eff,
  mark,
  models,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const { t } = useTranslation();
  const rawEngine = isCreate
    ? values!.codexEngine ?? "auto"
    : eff("adapterConfig", "engine", String(config.engine ?? "auto"));
  const engine = rawEngine === "acp" || rawEngine === "cli" ? rawEngine : "auto";
  const acpSelected = engine === "acp";
  const bypassEnabled =
    config.dangerouslyBypassApprovalsAndSandbox === true || config.dangerouslyBypassSandbox === true;
  const fastModeEnabled = isCreate
    ? Boolean(values!.fastMode)
    : eff("adapterConfig", "fastMode", Boolean(config.fastMode));
  const currentModel = isCreate
    ? String(values!.model ?? "")
    : eff("adapterConfig", "model", String(config.model ?? ""));
  const fastModeManualModel = isCodexLocalManualModel(currentModel);
  const fastModeSupported = isCodexLocalFastModeSupported(currentModel);
  const supportedModelsLabel = CODEX_LOCAL_FAST_MODE_SUPPORTED_MODELS.join(", ");
  const fastModeMessage = fastModeManualModel
    ? t("agentConfig.fastModeManualWarning", {
        defaultValue: "Fast mode will be passed through for this manual model. If Codex rejects it, turn the toggle off.",
      })
    : fastModeSupported
      ? t("agentConfig.fastModeWarning", {
          defaultValue: "Fast mode consumes credits/tokens much faster than standard Codex runs.",
        })
      : t("agentConfig.fastModeUnsupportedWarning", {
          defaultValue: "Fast mode currently only works on {{models}} or manual model IDs. Paperclip will ignore this toggle until the model is switched.",
          models: supportedModelsLabel,
        });

  return (
    <>
      <Field
        label={t("agentConfig.executionEngine")}
        hint={t("agentConfig.executionEngineHint", { cli: "Codex CLI" })}
      >
        <select
          className={inputClass}
          value={engine}
          onChange={(e) => {
            const value = e.target.value === "acp" ? "acp" : e.target.value === "cli" ? "cli" : "auto";
            isCreate
              ? set!({ codexEngine: value })
              : mark("adapterConfig", "engine", value === "auto" ? undefined : value);
          }}
        >
          <option value="auto">{t("agentConfig.autoAcpPreferred")}</option>
          <option value="cli">Codex CLI</option>
          <option value="acp">ACP</option>
        </select>
      </Field>
      {acpSelected && (
        <>
          <Field
            label={t("agentConfig.acpServerCommand")}
            hint={t("agentConfig.acpServerCommandHint", {
              provider: "Codex",
              defaultCommand: "codex-acp",
            })}
          >
            <DraftInput
              value={
                isCreate
                  ? values!.codexAcpAgentCommand ?? ""
                  : eff("adapterConfig", "agentCommand", String(config.agentCommand ?? ""))
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ codexAcpAgentCommand: v })
                  : mark("adapterConfig", "agentCommand", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="codex-acp"
            />
          </Field>
          <Field label={t("agentConfig.acpSessionMode")} hint={t("agentConfig.acpSessionModeHint")}>
            <select
              className={inputClass}
              value={
                isCreate
                  ? values!.codexAcpMode ?? "persistent"
                  : eff("adapterConfig", "mode", String(config.mode ?? "persistent"))
              }
              onChange={(e) => {
                const value = e.target.value === "oneshot" ? "oneshot" : "persistent";
                isCreate
                  ? set!({ codexAcpMode: value })
                  : mark("adapterConfig", "mode", value);
              }}
            >
              <option value="persistent">{t("agentConfig.persistent")}</option>
              <option value="oneshot">{t("agentConfig.oneShot")}</option>
            </select>
          </Field>
          <Field
            label={t("agentConfig.acpNonInteractivePermissions")}
            hint={t("agentConfig.acpNonInteractivePermissionsHint")}
          >
            <select
              className={inputClass}
              value={
                isCreate
                  ? values!.codexAcpNonInteractivePermissions ?? "deny"
                  : eff("adapterConfig", "nonInteractivePermissions", String(config.nonInteractivePermissions ?? "deny"))
              }
              onChange={(e) => {
                const value = e.target.value === "fail" ? "fail" : "deny";
                isCreate
                  ? set!({ codexAcpNonInteractivePermissions: value })
                  : mark("adapterConfig", "nonInteractivePermissions", value);
              }}
            >
              <option value="deny">{t("agentConfig.deny")}</option>
              <option value="fail">{t("agentConfig.fail")}</option>
            </select>
          </Field>
          <Field
            label={t("agentConfig.acpStateDirectory")}
            hint={t("agentConfig.acpStateDirectoryHint")}
          >
            <div className="flex items-center gap-2">
              <DraftInput
                value={
                  isCreate
                    ? values!.codexAcpStateDir ?? ""
                    : eff("adapterConfig", "stateDir", String(config.stateDir ?? ""))
                }
                onCommit={(v) =>
                  isCreate
                    ? set!({ codexAcpStateDir: v })
                    : mark("adapterConfig", "stateDir", v || undefined)
                }
                immediate
                className={inputClass}
                placeholder="/path/to/acp-state"
              />
              <ChoosePathButton />
            </div>
          </Field>
          <Field
            label={t("agentConfig.acpWarmProcessIdleMs")}
            hint={t("agentConfig.acpWarmProcessIdleMsHint")}
          >
            {isCreate ? (
              <input
                type="number"
                className={inputClass}
                value={values!.codexAcpWarmHandleIdleMs ?? 0}
                onChange={(e) => set!({ codexAcpWarmHandleIdleMs: Number(e.target.value) })}
              />
            ) : (
              <DraftNumberInput
                value={eff(
                  "adapterConfig",
                  "warmHandleIdleMs",
                  Number(config.warmHandleIdleMs ?? 0),
                )}
                onCommit={(v) => mark("adapterConfig", "warmHandleIdleMs", v || 0)}
                immediate
                className={inputClass}
              />
            )}
          </Field>
        </>
      )}
      {!hideInstructionsFile && (
        <Field
          label={t("agentConfig.instructionsFileLabel", {
            defaultValue: "Agent instructions file",
          })}
          hint={t("agentConfig.codexInstructionsFileHint", {
            defaultValue: instructionsFileHint,
          })}
        >
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? values!.instructionsFilePath ?? ""
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark("adapterConfig", "instructionsFilePath", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder={t("agentConfig.instructionsFilePlaceholder", {
                defaultValue: "/absolute/path/to/AGENTS.md",
              })}
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
      <ToggleField
        label={t("agentConfig.bypassSandbox", { defaultValue: "Bypass sandbox" })}
        hint={help.dangerouslyBypassSandbox}
        checked={
          isCreate
            ? values!.dangerouslyBypassSandbox
            : eff(
                "adapterConfig",
                "dangerouslyBypassApprovalsAndSandbox",
                bypassEnabled,
              )
        }
        onChange={(v) =>
          isCreate
            ? set!({ dangerouslyBypassSandbox: v })
            : mark("adapterConfig", "dangerouslyBypassApprovalsAndSandbox", v)
        }
      />
      <ToggleField
        label={t("agentConfig.enableSearch", { defaultValue: "Enable search" })}
        hint={help.search}
        checked={
          isCreate
            ? values!.search
            : eff("adapterConfig", "search", !!config.search)
        }
        onChange={(v) =>
          isCreate
            ? set!({ search: v })
            : mark("adapterConfig", "search", v)
        }
      />
      <ToggleField
        label={t("agentConfig.fastMode", { defaultValue: "Fast mode" })}
        hint={help.fastMode}
        checked={fastModeEnabled}
        onChange={(v) =>
          isCreate
            ? set!({ fastMode: v })
            : mark("adapterConfig", "fastMode", v)
        }
      />
      {fastModeEnabled && (
        <div className="rounded-md border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          {fastModeMessage}
        </div>
      )}
      <LocalWorkspaceRuntimeFields
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
        eff={eff}
        mode={mode}
        adapterType={adapterType}
        models={models}
      />
    </>
  );
}
