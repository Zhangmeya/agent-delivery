import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Play, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import {
  type EnvBinding,
  type Environment,
  type EnvironmentProviderCapability,
  type EnvironmentProbeResult,
  type EnvironmentCustomImageSetupSession,
  type JsonSchema,
} from "@penclipai/shared";
import {
  environmentsApi,
  type EnvironmentCustomImageConnectionPayload,
  type EnvironmentCustomImageSetupSessionResult,
} from "@/api/environments";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { secretsApi } from "@/api/secrets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EnvVarEditor } from "@/components/EnvVarEditor";
import { JsonSchemaForm, getDefaultValues, validateJsonSchemaForm } from "@/components/JsonSchemaForm";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import {
  Field,
  ToggleField,
} from "../components/agent-config-primitives";

type EnvironmentFormState = {
  name: string;
  description: string;
  driver: "local" | "ssh" | "sandbox";
  sshHost: string;
  sshPort: string;
  sshUsername: string;
  sshRemoteWorkspacePath: string;
  sshPrivateKey: string;
  sshPrivateKeySecretId: string;
  sshKnownHosts: string;
  sshStrictHostKeyChecking: boolean;
  sandboxProvider: string;
  sandboxConfig: Record<string, unknown>;
  envVars: Record<string, EnvBinding>;
};

function buildEnvironmentPayload(form: EnvironmentFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    driver: form.driver,
    envVars: form.envVars,
    config:
      form.driver === "ssh"
        ? {
            host: form.sshHost.trim(),
            port: Number.parseInt(form.sshPort || "22", 10) || 22,
            username: form.sshUsername.trim(),
            remoteWorkspacePath: form.sshRemoteWorkspacePath.trim(),
            privateKey: form.sshPrivateKey.trim() || null,
            privateKeySecretRef:
              form.sshPrivateKey.trim().length > 0 || !form.sshPrivateKeySecretId
                ? null
                : { type: "secret_ref" as const, secretId: form.sshPrivateKeySecretId, version: "latest" as const },
            knownHosts: form.sshKnownHosts.trim() || null,
            strictHostKeyChecking: form.sshStrictHostKeyChecking,
          }
        : form.driver === "sandbox"
          ? {
              provider: form.sandboxProvider.trim(),
              ...form.sandboxConfig,
            }
          : {},
  } as const;
}

function createEmptyEnvironmentForm(): EnvironmentFormState {
  return {
    name: "",
    description: "",
    driver: "ssh",
    sshHost: "",
    sshPort: "22",
    sshUsername: "",
    sshRemoteWorkspacePath: "",
    sshPrivateKey: "",
    sshPrivateKeySecretId: "",
    sshKnownHosts: "",
    sshStrictHostKeyChecking: true,
    sandboxProvider: "",
    sandboxConfig: {},
    envVars: {},
  };
}

function isLocalEnvironment(environment: Environment | null | undefined) {
  return environment?.driver === "local";
}

function normalizeNonLocalEnvironmentId(
  environmentId: string | null | undefined,
  environments: readonly Environment[],
): string {
  if (!environmentId) return "";
  const environment = environments.find((candidate) => candidate.id === environmentId) ?? null;
  return isLocalEnvironment(environment) ? "" : environmentId;
}

function readSshConfig(environment: Environment) {
  const config = environment.config ?? {};
  return {
    host: typeof config.host === "string" ? config.host : "",
    port:
      typeof config.port === "number"
        ? String(config.port)
        : typeof config.port === "string"
          ? config.port
          : "22",
    username: typeof config.username === "string" ? config.username : "",
    remoteWorkspacePath:
      typeof config.remoteWorkspacePath === "string" ? config.remoteWorkspacePath : "",
    privateKey: "",
    privateKeySecretId:
      config.privateKeySecretRef &&
      typeof config.privateKeySecretRef === "object" &&
      !Array.isArray(config.privateKeySecretRef) &&
      typeof (config.privateKeySecretRef as { secretId?: unknown }).secretId === "string"
        ? String((config.privateKeySecretRef as { secretId: string }).secretId)
        : "",
    knownHosts: typeof config.knownHosts === "string" ? config.knownHosts : "",
    strictHostKeyChecking:
      typeof config.strictHostKeyChecking === "boolean"
        ? config.strictHostKeyChecking
        : true,
  };
}

function readSandboxConfig(environment: Environment) {
  const config = environment.config ?? {};
  const { provider: rawProvider, ...providerConfig } = config;
  return {
    provider: typeof rawProvider === "string" && rawProvider.trim().length > 0
      ? rawProvider
      : "fake",
    config: providerConfig,
  };
}

function normalizeJsonSchema(schema: unknown): JsonSchema | null {
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema as JsonSchema
    : null;
}

function summarizeSandboxConfig(config: Record<string, unknown>): string | null {
  for (const key of ["template", "image", "region", "workspacePath"]) {
    const value = config[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

const ACTIVE_CUSTOM_IMAGE_SETUP_STATUSES = new Set<EnvironmentCustomImageSetupSession["status"]>([
  "starting",
  "waiting_for_user",
  "capturing",
]);

function isActiveCustomImageSetupSession(session: EnvironmentCustomImageSetupSession | null | undefined) {
  return Boolean(session && ACTIVE_CUSTOM_IMAGE_SETUP_STATUSES.has(session.status));
}

function readEnvironmentSandboxProvider(environment: Environment): string | null {
  return environment.driver === "sandbox" && typeof environment.config.provider === "string"
    ? environment.config.provider
    : null;
}

function formatDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function readConnectionCommand(payload: EnvironmentCustomImageConnectionPayload | null | undefined): string | null {
  return typeof payload?.command === "string" && payload.command.trim().length > 0
    ? payload.command
    : null;
}

function capabilityState(capability: EnvironmentProviderCapability | null | undefined) {
  if (!capability || capability.status !== "supported" || !capability.supportsInteractiveSetup) {
    return {
      kind: "unsupported" as const,
      labelKey: "companySettings.customImage.unsupportedProvider",
      labelDefault: "Unsupported provider",
      reasonKey: "companySettings.customImage.unsupportedProviderReason",
      reasonDefault: "This provider does not advertise interactive template setup.",
    };
  }

  if (!capability.supportsTemplateCapture) {
    return {
      kind: "capture_unavailable" as const,
      labelKey: "companySettings.customImage.captureUnavailable",
      labelDefault: "Setup capture unavailable",
      reasonKey: "companySettings.customImage.captureUnavailableReason",
      reasonDefault: "This provider advertises setup, but image capture is unavailable.",
    };
  }

  return {
    kind: "supported" as const,
    labelKey: "companySettings.customImage.templateSetup",
    labelDefault: "Template setup",
    reasonKey: null,
    reasonDefault: null,
  };
}

function sessionStatusCopy(status: EnvironmentCustomImageSetupSession["status"]) {
  switch (status) {
    case "starting":
      return { key: "companySettings.customImage.status.starting", defaultValue: "Setup starting" };
    case "waiting_for_user":
      return { key: "companySettings.customImage.status.waitingForUser", defaultValue: "Setup running" };
    case "capturing":
      return { key: "companySettings.customImage.status.capturing", defaultValue: "Capturing template" };
    case "promoted":
      return { key: "companySettings.customImage.status.promoted", defaultValue: "Template captured" };
    case "cancelled":
      return { key: "companySettings.customImage.status.cancelled", defaultValue: "Setup cancelled" };
    case "timed_out":
      return { key: "companySettings.customImage.status.timedOut", defaultValue: "Setup expired" };
    case "failed":
      return { key: "companySettings.customImage.status.failed", defaultValue: "Setup failed" };
    default:
      return { key: "companySettings.customImage.status.unknown", defaultValue: "Setup status" };
  }
}

function EnvironmentImageTemplatePanel({
  environment,
  providerCapability,
  providerDisplayName,
}: {
  environment: Environment;
  providerCapability: EnvironmentProviderCapability | null | undefined;
  providerDisplayName: string;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const state = capabilityState(providerCapability);
  const overviewKey = queryKeys.environments.customImageTemplate(environment.id);
  const stateLabel = t(state.labelKey, { defaultValue: state.labelDefault });
  const stateReason = state.reasonKey && state.reasonDefault
    ? t(state.reasonKey, { defaultValue: state.reasonDefault })
    : null;
  const sessionStatusText = (status: EnvironmentCustomImageSetupSession["status"]) => {
    const copy = sessionStatusCopy(status);
    return t(copy.key, { defaultValue: copy.defaultValue });
  };

  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () => environmentsApi.customImageTemplate(environment.id),
    enabled: state.kind === "supported",
    retry: false,
  });

  const activeSessionId = overviewQuery.data?.activeSession?.id ?? null;
  const sessionQuery = useQuery({
    queryKey: activeSessionId
      ? queryKeys.environments.customImageSetupSession(activeSessionId)
      : ["environment-custom-image-setup-sessions", "none", environment.id],
    queryFn: () => environmentsApi.customImageSetupSession(activeSessionId!),
    enabled: Boolean(activeSessionId && isActiveCustomImageSetupSession(overviewQuery.data?.activeSession)),
    retry: false,
  });

  function setSessionResult(result: EnvironmentCustomImageSetupSessionResult) {
    queryClient.setQueryData(
      queryKeys.environments.customImageSetupSession(result.session.id),
      result,
    );
  }

  function invalidateOverview() {
    void queryClient.invalidateQueries({ queryKey: overviewKey });
  }

  const startSetupMutation = useMutation({
    mutationFn: (input: { templateId?: string | null } = {}) =>
      environmentsApi.startCustomImageSetupSession(environment.id, {
        templateId: input.templateId ?? null,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(overviewKey, (current: typeof overviewQuery.data) => ({
        activeTemplate: current?.activeTemplate ?? null,
        activeSession: result.session,
        latestSession: result.session,
      }));
      setSessionResult(result);
      invalidateOverview();
      pushToast({
        title: t("companySettings.customImage.setupStartedTitle", { defaultValue: "Setup session started" }),
        body: t("companySettings.customImage.setupStartedBody", {
          defaultValue: "Connect details are available while the session is active.",
        }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("companySettings.customImage.setupStartFailedTitle", { defaultValue: "Failed to start setup" }),
        body: error instanceof Error
          ? error.message
          : t("companySettings.customImage.setupStartFailedBody", {
              defaultValue: "Setup session could not be started.",
            }),
        tone: "error",
      });
    },
  });

  const finishSetupMutation = useMutation({
    mutationFn: (sessionId: string) => environmentsApi.finishCustomImageSetupSession(sessionId, {}),
    onSuccess: (result) => {
      queryClient.setQueryData(overviewKey, {
        activeTemplate: result.template,
        activeSession: null,
        latestSession: result.session,
      });
      setSessionResult({ session: result.session, connectionPayload: null });
      invalidateOverview();
      pushToast({
        title: t("companySettings.customImage.templateCapturedTitle", { defaultValue: "Template captured" }),
        body: t("companySettings.customImage.templateCapturedBody", {
          defaultValue: "Future runs can use the promoted template.",
        }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("companySettings.customImage.templateCaptureFailedTitle", {
          defaultValue: "Failed to capture template",
        }),
        body: error instanceof Error
          ? error.message
          : t("companySettings.customImage.templateCaptureFailedBody", {
              defaultValue: "Template capture failed.",
            }),
        tone: "error",
      });
    },
  });

  const cancelSetupMutation = useMutation({
    mutationFn: (sessionId: string) =>
      environmentsApi.cancelCustomImageSetupSession(sessionId, { reason: "operator cancelled" }),
    onSuccess: (session) => {
      queryClient.setQueryData(overviewKey, (current: typeof overviewQuery.data) => ({
        activeTemplate: current?.activeTemplate ?? null,
        activeSession: null,
        latestSession: session,
      }));
      setSessionResult({ session, connectionPayload: null });
      invalidateOverview();
      pushToast({
        title: t("companySettings.customImage.setupCancelledTitle", { defaultValue: "Setup cancelled" }),
        body: t("companySettings.customImage.setupCancelledBody", {
          defaultValue: "The active template was not changed.",
        }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("companySettings.customImage.setupCancelFailedTitle", { defaultValue: "Failed to cancel setup" }),
        body: error instanceof Error
          ? error.message
          : t("companySettings.customImage.setupCancelFailedBody", {
              defaultValue: "Setup session could not be cancelled.",
            }),
        tone: "error",
      });
    },
  });

  const rollbackTemplateMutation = useMutation({
    mutationFn: () => environmentsApi.rollbackCustomImageTemplate(environment.id),
    onSuccess: (result) => {
      queryClient.setQueryData(overviewKey, (current: typeof overviewQuery.data) => ({
        activeTemplate: result.activeTemplate,
        activeSession: null,
        latestSession: current?.latestSession ?? null,
      }));
      invalidateOverview();
      pushToast({
        title: t("companySettings.customImage.templateRolledBackTitle", { defaultValue: "Template rolled back" }),
        body: t("companySettings.customImage.templateRolledBackBody", {
          defaultValue: "Future runs will use the previous template.",
        }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("companySettings.customImage.templateRollbackFailedTitle", {
          defaultValue: "Failed to roll back template",
        }),
        body: error instanceof Error
          ? error.message
          : t("companySettings.customImage.templateRollbackFailedBody", { defaultValue: "Rollback failed." }),
        tone: "error",
      });
    },
  });

  const disableTemplateMutation = useMutation({
    mutationFn: () => environmentsApi.disableCustomImageTemplate(environment.id),
    onSuccess: (template) => {
      queryClient.setQueryData(overviewKey, (current: typeof overviewQuery.data) => ({
        activeTemplate: null,
        activeSession: null,
        latestSession: current?.latestSession ?? null,
      }));
      invalidateOverview();
      pushToast({
        title: t("companySettings.customImage.templateDisabledTitle", { defaultValue: "Template disabled" }),
        body: t("companySettings.customImage.templateDisabledBody", {
          defaultValue: "Future runs will use the base provider configuration.",
        }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("companySettings.customImage.templateDisableFailedTitle", {
          defaultValue: "Failed to disable template",
        }),
        body: error instanceof Error
          ? error.message
          : t("companySettings.customImage.templateDisableFailedBody", { defaultValue: "Disable failed." }),
        tone: "error",
      });
    },
  });

  if (state.kind !== "supported") {
    return (
      <div className="mt-3 border-t border-border/60 pt-3 text-xs" data-testid={`custom-image-template-state-${environment.id}`}>
        <div className="font-medium text-foreground">{stateLabel}</div>
        <div className="mt-1 text-muted-foreground">{stateReason}</div>
      </div>
    );
  }

  if (overviewQuery.isLoading) {
    return (
      <div className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        {t("companySettings.customImage.loading", { defaultValue: "Loading template setup..." })}
      </div>
    );
  }

  if (overviewQuery.isError) {
    return (
      <div className="mt-3 border-t border-border/60 pt-3 text-xs text-destructive">
        {overviewQuery.error instanceof Error
          ? overviewQuery.error.message
          : t("companySettings.customImage.loadFailed", { defaultValue: "Template setup could not be loaded." })}
      </div>
    );
  }

  const overview = overviewQuery.data;
  const activeTemplate = overview?.activeTemplate ?? null;
  const refreshedSession = sessionQuery.data?.session ?? null;
  const session = refreshedSession ?? overview?.activeSession ?? null;
  const latestSession = !isActiveCustomImageSetupSession(session)
    ? session ?? overview?.latestSession ?? null
    : overview?.latestSession ?? null;
  const connectionPayload = session?.status === "waiting_for_user"
    ? sessionQuery.data?.connectionPayload ?? null
    : null;
  const connectionCommand = readConnectionCommand(connectionPayload);
  const sessionExpiresAt = formatDateTime(connectionPayload?.expiresAt ?? session?.expiresAt ?? null);
  const capturedAt = formatDateTime(activeTemplate?.capturedAt ?? activeTemplate?.createdAt ?? null);
  const lastUsedAt = formatDateTime(activeTemplate?.lastUsedAt ?? null);
  const isMutating =
    startSetupMutation.isPending ||
    finishSetupMutation.isPending ||
    cancelSetupMutation.isPending ||
    rollbackTemplateMutation.isPending ||
    disableTemplateMutation.isPending;

  if (session && isActiveCustomImageSetupSession(session)) {
    const isCapturing = session.status === "capturing";
    return (
      <div className="mt-3 border-t border-border/60 pt-3" data-testid={`custom-image-template-state-${environment.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-medium">{sessionStatusText(session.status)}</div>
            <div className="text-xs text-muted-foreground">
              {providerDisplayName}
              {sessionExpiresAt
                ? t("companySettings.customImage.expiresAt", {
                    defaultValue: " · expires {{time}}",
                    time: sessionExpiresAt,
                  })
                : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => finishSetupMutation.mutate(session.id)}
              disabled={isMutating || session.status !== "waiting_for_user"}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {t("companySettings.customImage.finished", { defaultValue: "Finished" })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => cancelSetupMutation.mutate(session.id)}
              disabled={isMutating || isCapturing}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              {t("Cancel", { defaultValue: "Cancel" })}
            </Button>
          </div>
        </div>
        {session.status === "waiting_for_user" && connectionCommand ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px] leading-5">
              {connectionCommand}
            </code>
          </div>
        ) : null}
        {session.status === "waiting_for_user" && !connectionCommand ? (
          <div className="mt-2 text-xs text-muted-foreground">
            {t("companySettings.customImage.connectionUnavailable", {
              defaultValue: "Connection details are not available yet.",
            })}
          </div>
        ) : null}
        {session.failureReason ? (
          <div className="mt-2 text-xs text-destructive">{session.failureReason}</div>
        ) : null}
      </div>
    );
  }

  if (activeTemplate) {
    return (
      <div className="mt-3 border-t border-border/60 pt-3" data-testid={`custom-image-template-state-${environment.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-medium">
              {t("companySettings.customImage.activeTemplate", { defaultValue: "Active template" })}
            </div>
            <div className="text-xs text-muted-foreground">
              {providerDisplayName} · {activeTemplate.templateKind}
              {capturedAt
                ? t("companySettings.customImage.capturedAt", {
                    defaultValue: " · captured {{time}}",
                    time: capturedAt,
                  })
                : ""}
              {lastUsedAt
                ? t("companySettings.customImage.lastUsedAt", {
                    defaultValue: " · last used {{time}}",
                    time: lastUsedAt,
                  })
                : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => startSetupMutation.mutate({ templateId: activeTemplate.id })}
              disabled={isMutating}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t("Refresh", { defaultValue: "Refresh" })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => rollbackTemplateMutation.mutate()}
              disabled={isMutating}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {t("companySettings.customImage.rollback", { defaultValue: "Rollback" })}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => disableTemplateMutation.mutate()}
              disabled={isMutating}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("companySettings.customImage.disable", { defaultValue: "Disable" })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-3" data-testid={`custom-image-template-state-${environment.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-medium">
            {t("companySettings.customImage.notConfigured", { defaultValue: "Not configured" })}
          </div>
          <div className="text-xs text-muted-foreground">
            {latestSession
              ? sessionStatusText(latestSession.status)
              : t("companySettings.customImage.captureDescription", {
                  defaultValue: "Capture a custom {{provider}} image with your tools already logged in.",
                  provider: providerDisplayName,
                })}
          </div>
          {latestSession?.failureReason ? (
            <div className="text-xs text-destructive">{latestSession.failureReason}</div>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => startSetupMutation.mutate({ templateId: null })}
          disabled={isMutating}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {t("companySettings.customImage.configureImage", { defaultValue: "Configure image" })}
        </Button>
      </div>
    </div>
  );
}

export function CompanyEnvironments() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [environmentDialogOpen, setEnvironmentDialogOpen] = useState(false);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [environmentForm, setEnvironmentForm] = useState<EnvironmentFormState>(createEmptyEnvironmentForm);
  const [probeResults, setProbeResults] = useState<Record<string, EnvironmentProbeResult | null>>({});
  const [testingEnvironmentId, setTestingEnvironmentId] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("Settings", { defaultValue: "Settings" }), href: "/company/settings" },
      { label: t("Instance settings", { defaultValue: "Instance settings" }), href: "/company/settings/instance/general" },
      { label: t("companySettings.environments", { defaultValue: "Environments" }) },
    ]);
  }, [setBreadcrumbs, t]);

  const { data: instanceSettings } = useQuery({
    queryKey: queryKeys.instance.settings,
    queryFn: () => instanceSettingsApi.get(),
    retry: false,
  });

  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    retry: false,
  });
  const environmentsEnabled = experimentalSettings?.enableEnvironments === true;

  const { data: environments } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.environments.list(selectedCompanyId) : ["environments", "none"],
    queryFn: () => environmentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && environmentsEnabled,
  });
  const { data: environmentCapabilities } = useQuery({
    queryKey: selectedCompanyId ? ["environment-capabilities", selectedCompanyId] : ["environment-capabilities", "none"],
    queryFn: () => environmentsApi.capabilities(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && environmentsEnabled,
  });

  const { data: secrets } = useQuery({
    queryKey: selectedCompanyId ? ["company-secrets", selectedCompanyId] : ["company-secrets", "none"],
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const createSecret = useMutation({
    mutationFn: (input: { name: string; value: string }) => {
      if (!selectedCompanyId) {
        throw new Error(t("agentConfig.selectCompanyToCreateSecrets", { defaultValue: "Select a company before creating secrets." }));
      }
      return secretsApi.create(selectedCompanyId, input);
    },
    onSuccess: async () => {
      if (!selectedCompanyId) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(selectedCompanyId) });
      await queryClient.invalidateQueries({ queryKey: ["company-secrets", selectedCompanyId] });
    },
  });

  const environmentMutation = useMutation({
    mutationFn: async (form: EnvironmentFormState) => {
      const body = buildEnvironmentPayload(form);

      if (editingEnvironmentId) {
        return await environmentsApi.update(editingEnvironmentId, body);
      }

      return await environmentsApi.create(selectedCompanyId!, body);
    },
    onSuccess: async (environment) => {
      const wasEditing = editingEnvironmentId !== null;
      await queryClient.invalidateQueries({
        queryKey: queryKeys.environments.list(selectedCompanyId!),
      });
      setEnvironmentDialogOpen(false);
      setEditingEnvironmentId(null);
      setEnvironmentForm(createEmptyEnvironmentForm());
      environmentMutation.reset();
      draftEnvironmentProbeMutation.reset();
      pushToast({
        title: wasEditing
          ? t("companySettings.environmentUpdated")
          : t("companySettings.environmentCreated"),
        body: t("companySettings.environmentReady", { name: environment.name }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("companySettings.failedToSaveEnvironment"),
        body: error instanceof Error ? error.message : t("companySettings.environmentSaveFailed"),
        tone: "error",
      });
    },
  });

  const defaultEnvironmentMutation = useMutation({
    mutationFn: async (defaultEnvironmentId: string | null) =>
      await instanceSettingsApi.update({ defaultEnvironmentId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.settings });
      pushToast({
        title: t("companySettings.defaultEnvironmentUpdated", { defaultValue: "Default environment updated" }),
        body: t("companySettings.defaultEnvironmentUpdatedBody", {
          defaultValue: "Agent inheritance now follows the updated instance default.",
        }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("companySettings.defaultEnvironmentUpdateFailed", { defaultValue: "Failed to update default environment" }),
        body: error instanceof Error
          ? error.message
          : t("companySettings.defaultEnvironmentUpdateFailedBody", { defaultValue: "Default environment update failed." }),
        tone: "error",
      });
    },
  });

  const environmentProbeMutation = useMutation({
    mutationFn: async (environmentId: string) => await environmentsApi.probe(environmentId),
    onMutate: (environmentId) => {
      setTestingEnvironmentId(environmentId);
    },
    onSettled: (_probe, _error, environmentId) => {
      setTestingEnvironmentId((current) => (current === environmentId ? null : current));
    },
    onSuccess: (probe, environmentId) => {
      setProbeResults((current) => ({
        ...current,
        [environmentId]: probe,
      }));
      pushToast({
        title: probe.ok ? t("companySettings.environmentProbePassed") : t("companySettings.environmentProbeFailed"),
        body: probe.summary,
        tone: probe.ok ? "success" : "error",
      });
    },
    onError: (error, environmentId) => {
      const failedEnvironment = (environments ?? []).find((environment) => environment.id === environmentId);
      setProbeResults((current) => ({
        ...current,
        [environmentId]: {
          ok: false,
          driver: failedEnvironment?.driver ?? "local",
          summary: error instanceof Error ? error.message : t("companySettings.environmentProbeFailedSentence"),
          details: null,
        },
      }));
      pushToast({
        title: t("companySettings.environmentProbeFailed"),
        body: error instanceof Error ? error.message : t("companySettings.environmentProbeFailedSentence"),
        tone: "error",
      });
    },
  });

  const draftEnvironmentProbeMutation = useMutation({
    mutationFn: async (form: EnvironmentFormState) => {
      const body = buildEnvironmentPayload(form);
      return await environmentsApi.probeConfig(selectedCompanyId!, body);
    },
    onSuccess: (probe) => {
      pushToast({
        title: probe.ok ? t("companySettings.draftProbePassed") : t("companySettings.draftProbeFailed"),
        body: probe.summary,
        tone: probe.ok ? "success" : "error",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("companySettings.draftProbeFailed"),
        body: error instanceof Error ? error.message : t("companySettings.environmentProbeFailedSentence"),
        tone: "error",
      });
    },
  });

  useEffect(() => {
    setEnvironmentDialogOpen(false);
    setEditingEnvironmentId(null);
    setEnvironmentForm(createEmptyEnvironmentForm());
    setProbeResults({});
    setTestingEnvironmentId(null);
  }, [selectedCompanyId]);

  function handleStartCreateEnvironment() {
    setEditingEnvironmentId(null);
    setEnvironmentForm(createEmptyEnvironmentForm());
    environmentMutation.reset();
    draftEnvironmentProbeMutation.reset();
    setEnvironmentDialogOpen(true);
  }

  function handleEditEnvironment(environment: Environment) {
    environmentMutation.reset();
    draftEnvironmentProbeMutation.reset();
    setEditingEnvironmentId(environment.id);
    setEnvironmentDialogOpen(true);
    if (environment.driver === "ssh") {
      const ssh = readSshConfig(environment);
      setEnvironmentForm({
        ...createEmptyEnvironmentForm(),
        name: environment.name,
        description: environment.description ?? "",
        driver: "ssh",
        sshHost: ssh.host,
        sshPort: ssh.port,
        sshUsername: ssh.username,
        sshRemoteWorkspacePath: ssh.remoteWorkspacePath,
        sshPrivateKey: ssh.privateKey,
        sshPrivateKeySecretId: ssh.privateKeySecretId,
        sshKnownHosts: ssh.knownHosts,
        sshStrictHostKeyChecking: ssh.strictHostKeyChecking,
        envVars: environment.envVars ?? {},
      });
      return;
    }

    if (environment.driver === "sandbox") {
      const sandbox = readSandboxConfig(environment);
      setEnvironmentForm({
        ...createEmptyEnvironmentForm(),
        name: environment.name,
        description: environment.description ?? "",
        driver: "sandbox",
        sandboxProvider: sandbox.provider,
        sandboxConfig: sandbox.config,
        envVars: environment.envVars ?? {},
      });
      return;
    }

    setEnvironmentForm({
      ...createEmptyEnvironmentForm(),
      name: environment.name,
      description: environment.description ?? "",
      driver: "local",
      envVars: environment.envVars ?? {},
    });
  }

  function closeEnvironmentDialog() {
    if (environmentMutation.isPending) return;
    setEnvironmentDialogOpen(false);
    setEditingEnvironmentId(null);
    setEnvironmentForm(createEmptyEnvironmentForm());
    environmentMutation.reset();
    draftEnvironmentProbeMutation.reset();
  }

  const discoveredPluginSandboxProviders = Object.entries(environmentCapabilities?.sandboxProviders ?? {})
    .filter(([provider, capability]) => provider !== "fake" && capability.supportsRunExecution)
    .map(([provider, capability]) => ({
      provider,
      displayName: capability.displayName || provider,
      description: capability.description,
      configSchema: normalizeJsonSchema(capability.configSchema),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const sandboxCreationEnabled = discoveredPluginSandboxProviders.length > 0;
  const pluginSandboxProviders =
    environmentForm.sandboxProvider.trim().length > 0 &&
    environmentForm.sandboxProvider !== "fake" &&
    !discoveredPluginSandboxProviders.some((provider) => provider.provider === environmentForm.sandboxProvider)
      ? [
          ...discoveredPluginSandboxProviders,
          { provider: environmentForm.sandboxProvider, displayName: environmentForm.sandboxProvider, description: undefined, configSchema: null },
        ]
      : discoveredPluginSandboxProviders;

  const selectedSandboxProvider = pluginSandboxProviders.find(
    (provider) => provider.provider === environmentForm.sandboxProvider,
  ) ?? null;
  const selectedSandboxSchema = selectedSandboxProvider?.configSchema ?? null;
  const sandboxConfigErrors =
    environmentForm.driver === "sandbox" && selectedSandboxSchema
      ? validateJsonSchemaForm(selectedSandboxSchema as any, environmentForm.sandboxConfig)
      : {};

  useEffect(() => {
    if (environmentForm.driver !== "sandbox") return;
    if (environmentForm.sandboxProvider.trim().length > 0 && environmentForm.sandboxProvider !== "fake") return;
    const firstProvider = discoveredPluginSandboxProviders[0]?.provider;
    if (!firstProvider) return;
    const firstSchema = discoveredPluginSandboxProviders[0]?.configSchema;
    setEnvironmentForm((current) => (
      current.driver !== "sandbox" || (current.sandboxProvider.trim().length > 0 && current.sandboxProvider !== "fake")
        ? current
        : {
            ...current,
            sandboxProvider: firstProvider,
            sandboxConfig: firstSchema ? getDefaultValues(firstSchema as any) : {},
          }
    ));
  }, [discoveredPluginSandboxProviders, environmentForm.driver, environmentForm.sandboxProvider]);

  const environmentFormValid =
    environmentForm.name.trim().length > 0 &&
    (environmentForm.driver !== "ssh" ||
      (
        environmentForm.sshHost.trim().length > 0 &&
        environmentForm.sshUsername.trim().length > 0 &&
        environmentForm.sshRemoteWorkspacePath.trim().length > 0
      )) &&
    (environmentForm.driver !== "sandbox" ||
      environmentForm.sandboxProvider.trim().length > 0 &&
      environmentForm.sandboxProvider !== "fake" &&
      Object.keys(sandboxConfigErrors).length === 0);

  const savedEnvironments = environments ?? [];
  const editingEnvironment = editingEnvironmentId
    ? savedEnvironments.find((environment) => environment.id === editingEnvironmentId) ?? null
    : null;
  const editingSandboxProvider = editingEnvironment ? readEnvironmentSandboxProvider(editingEnvironment) : null;
  const editingSandboxCapability = editingSandboxProvider
    ? environmentCapabilities?.sandboxProviders?.[editingSandboxProvider]
    : null;
  const editingSandboxDisplayName = editingSandboxCapability?.displayName ?? editingSandboxProvider ?? "sandbox";
  const nonLocalEnvironments = savedEnvironments.filter((environment) => !isLocalEnvironment(environment));
  const instanceDefaultEnvironmentId = normalizeNonLocalEnvironmentId(
    instanceSettings?.defaultEnvironmentId ?? null,
    savedEnvironments,
  );

  if (!selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("companySettings.environmentsSelectCompany", {
          defaultValue: "Select a company context to manage environment secrets and bindings.",
        })}
      </div>
    );
  }

  if (!environmentsEnabled) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="rounded-md border border-border px-4 py-4 text-sm text-muted-foreground">
          {t("companySettings.environmentsDisabled", {
            defaultValue: "Enable Environments in instance experimental settings to manage shared execution targets.",
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6" data-testid="instance-settings-environments-section">
      <div className="space-y-4 rounded-md border border-border px-4 py-4">
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {t("companySettings.defaultEnvironment", { defaultValue: "Default" })}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("companySettings.defaultEnvironmentHint", {
                  defaultValue: "Agents inherit this execution target unless project, issue, or agent settings choose another.",
                })}
              </div>
            </div>
            <div className="min-w-[18rem] flex-1">
              <select
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                value={instanceDefaultEnvironmentId}
                onChange={(event) =>
                  defaultEnvironmentMutation.mutate(event.target.value || null)}
                disabled={defaultEnvironmentMutation.isPending}
              >
                <option value="">{t("Local", { defaultValue: "Local" })}</option>
                {nonLocalEnvironments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name} · {environment.driver}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={handleStartCreateEnvironment}>
              {t("companySettings.addEnvironment", { defaultValue: "Add environment" })}
            </Button>
          </div>
          {savedEnvironments.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t("companySettings.noEnvironments")}
            </div>
          ) : (
            savedEnvironments.map((environment) => {
              const probe = probeResults[environment.id] ?? null;
              const isEditing = editingEnvironmentId === environment.id;
              const sandboxProvider = readEnvironmentSandboxProvider(environment);
              const sandboxProviderCapability = sandboxProvider
                ? environmentCapabilities?.sandboxProviders?.[sandboxProvider]
                : null;
              const sandboxProviderDisplayName =
                sandboxProviderCapability?.displayName ?? sandboxProvider ?? "sandbox";
              return (
                <div
                  key={environment.id}
                  className="rounded-md border border-border/70 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        {environment.name} <span className="text-muted-foreground">· {environment.driver}</span>
                      </div>
                      {environment.description ? (
                        <div className="text-xs text-muted-foreground">{environment.description}</div>
                      ) : null}
                      {environment.driver === "ssh" ? (
                        <div className="text-xs text-muted-foreground">
                          {typeof environment.config.host === "string"
                            ? environment.config.host
                            : t("companySettings.sshHostFallback")} ·{" "}
                          {typeof environment.config.username === "string"
                            ? environment.config.username
                            : t("companySettings.sshUserFallback")}
                        </div>
                      ) : environment.driver === "sandbox" ? (
                        <div className="text-xs text-muted-foreground">
                          {(() => {
                            const summary = summarizeSandboxConfig(environment.config as Record<string, unknown>);
                            return summary
                              ? t("{{name}} sandbox provider · {{summary}}", {
                                defaultValue: "{{name}} sandbox provider · {{summary}}",
                                name: sandboxProviderDisplayName,
                                summary,
                              })
                              : t("{{name}} sandbox provider", {
                                defaultValue: "{{name}} sandbox provider",
                                name: sandboxProviderDisplayName,
                              });
                          })()}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">{t("companySettings.runsOnThisPaperclipHost")}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {environment.driver !== "local" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => environmentProbeMutation.mutate(environment.id)}
                          disabled={testingEnvironmentId === environment.id}
                        >
                          {testingEnvironmentId === environment.id
                            ? t("Testing...", { defaultValue: "Testing..." })
                          : environment.driver === "ssh"
                              ? t("companySettings.testConnection")
                              : t("companySettings.testProvider")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditEnvironment(environment)}
                      >
                        {isEditing ? t("companySettings.editing") : t("Edit", { defaultValue: "Edit" })}
                      </Button>
                    </div>
                  </div>
                  {probe ? (
                    <div
                      className={
                        probe.ok
                          ? "mt-3 rounded border border-green-500/30 bg-green-500/5 px-2.5 py-2 text-xs text-green-700"
                          : "mt-3 rounded border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
                      }
                    >
                      <div className="font-medium">{probe.summary}</div>
                      {probe.details?.error && typeof probe.details.error === "string" ? (
                        <div className="mt-1 font-mono text-[11px]">{probe.details.error}</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog
        open={environmentDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setEnvironmentDialogOpen(true);
            return;
          }
          closeEnvironmentDialog();
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pr-12 pt-6">
            <DialogTitle>
              {editingEnvironmentId
                ? t("companySettings.editEnvironment", { defaultValue: "Edit environment" })
                : t("companySettings.addEnvironment", { defaultValue: "Add environment" })}
            </DialogTitle>
            <DialogDescription>
              {t("companySettings.environmentDialogDescription", {
                defaultValue: "Configure a reusable execution target for your agents. Saved changes affect future runs; Paperclip may start fresh sessions or sandbox leases after environment config changes.",
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              <Field label={t("Name", { defaultValue: "Name" })} hint={t("companySettings.environmentNameHint")}>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                  type="text"
                  value={environmentForm.name}
                  onChange={(e) => setEnvironmentForm((current) => ({ ...current, name: e.target.value }))}
                />
              </Field>
              <Field label={t("Description", { defaultValue: "Description" })} hint={t("companySettings.environmentDescriptionHint")}>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                  type="text"
                  value={environmentForm.description}
                  onChange={(e) => setEnvironmentForm((current) => ({ ...current, description: e.target.value }))}
                />
              </Field>
              <Field label={t("companySettings.driver")} hint={t("companySettings.environmentDriverHint")}>
                <select
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                  value={environmentForm.driver}
                  onChange={(e) =>
                    setEnvironmentForm((current) => ({
                      ...current,
                      sandboxProvider:
                        e.target.value === "sandbox"
                          ? current.sandboxProvider.trim() || discoveredPluginSandboxProviders[0]?.provider || ""
                          : current.sandboxProvider,
                      sandboxConfig:
                        e.target.value === "sandbox"
                          ? (
                              current.sandboxProvider.trim().length > 0 && current.driver === "sandbox"
                                ? current.sandboxConfig
                                : discoveredPluginSandboxProviders[0]?.configSchema
                                  ? getDefaultValues(discoveredPluginSandboxProviders[0].configSchema as any)
                                  : {}
                            )
                          : current.sandboxConfig,
                      driver:
                        e.target.value === "local"
                          ? "local"
                          : e.target.value === "sandbox"
                            ? "sandbox"
                            : "ssh",
                    }))}
                >
                  {sandboxCreationEnabled || environmentForm.driver === "sandbox" ? (
                    <option value="sandbox">{t("companySettings.sandbox")}</option>
                  ) : null}
                  <option value="ssh">SSH</option>
                  {environmentForm.driver === "local" ? (
                    <option value="local">{t("Local", { defaultValue: "Local" })}</option>
                  ) : null}
                </select>
              </Field>

              {environmentForm.driver === "ssh" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t("companySettings.host")} hint={t("companySettings.hostHint")}>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      type="text"
                      value={environmentForm.sshHost}
                      onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshHost: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("companySettings.port")} hint={t("companySettings.portHint")}>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      type="number"
                      min={1}
                      max={65535}
                      value={environmentForm.sshPort}
                      onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshPort: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("companySettings.username")} hint={t("companySettings.usernameHint")}>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      type="text"
                      value={environmentForm.sshUsername}
                      onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshUsername: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("companySettings.remoteWorkspacePath")} hint={t("companySettings.remoteWorkspacePathHint")}>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      type="text"
                      placeholder="/Users/paperclip/workspace"
                      value={environmentForm.sshRemoteWorkspacePath}
                      onChange={(e) =>
                        setEnvironmentForm((current) => ({ ...current, sshRemoteWorkspacePath: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("companySettings.privateKey")} hint={t("companySettings.privateKeyHint")}>
                    <div className="space-y-2">
                      <select
                        className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                        value={environmentForm.sshPrivateKeySecretId}
                        onChange={(e) =>
                          setEnvironmentForm((current) => ({
                            ...current,
                            sshPrivateKeySecretId: e.target.value,
                            sshPrivateKey: e.target.value ? "" : current.sshPrivateKey,
                          }))}
                      >
                        <option value="">{t("companySettings.noSavedSecret")}</option>
                        {(secrets ?? []).map((secret) => (
                          <option key={secret.id} value={secret.id}>{secret.name}</option>
                        ))}
                      </select>
                      <textarea
                        className="h-32 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs font-mono outline-none"
                        value={environmentForm.sshPrivateKey}
                        disabled={!!environmentForm.sshPrivateKeySecretId}
                        onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshPrivateKey: e.target.value }))}
                      />
                    </div>
                  </Field>
                  <Field label={t("companySettings.knownHosts")} hint={t("companySettings.knownHostsHint")}>
                    <textarea
                      className="h-32 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs font-mono outline-none"
                      value={environmentForm.sshKnownHosts}
                      onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshKnownHosts: e.target.value }))}
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <ToggleField
                      label={t("companySettings.strictHostKeyChecking")}
                      hint={t("companySettings.strictHostKeyCheckingHint")}
                      checked={environmentForm.sshStrictHostKeyChecking}
                      onChange={(checked) =>
                        setEnvironmentForm((current) => ({ ...current, sshStrictHostKeyChecking: checked }))}
                    />
                  </div>
                </div>
              ) : null}

              {environmentForm.driver === "sandbox" ? (
                <div className="space-y-3">
                  <Field label={t("companySettings.provider")} hint={t("companySettings.sandboxProviderHint")}>
                    <select
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      value={environmentForm.sandboxProvider}
                      onChange={(e) => {
                        const nextProviderKey = e.target.value;
                        const nextProvider = pluginSandboxProviders.find((provider) => provider.provider === nextProviderKey) ?? null;
                        setEnvironmentForm((current) => ({
                          ...current,
                          sandboxProvider: nextProviderKey,
                          sandboxConfig:
                            current.sandboxProvider === nextProviderKey
                              ? current.sandboxConfig
                              : nextProvider?.configSchema
                                ? getDefaultValues(nextProvider.configSchema as any)
                                : {},
                        }));
                      }}
                    >
                      {pluginSandboxProviders.map((provider) => (
                        <option key={provider.provider} value={provider.provider}>
                          {provider.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {selectedSandboxProvider?.description ? (
                    <div className="text-xs text-muted-foreground">
                      {t(selectedSandboxProvider.description, { defaultValue: selectedSandboxProvider.description })}
                    </div>
                  ) : null}
                  {selectedSandboxSchema ? (
                    <JsonSchemaForm
                      schema={selectedSandboxSchema as any}
                      values={environmentForm.sandboxConfig}
                      onChange={(values) =>
                        setEnvironmentForm((current) => ({ ...current, sandboxConfig: values }))}
                      errors={sandboxConfigErrors}
                    />
                  ) : (
                    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {t("companySettings.sandboxNoExtraFields")}
                    </div>
                  )}
                  <ToggleField
                    label="Stream run logs"
                    hint="Stream the agent CLI's output live while sandbox runs execute (recommended). Turn off to deliver output only when the run finishes."
                    checked={environmentForm.sandboxConfig.streamRunLogs !== false}
                    onChange={(checked) =>
                      setEnvironmentForm((current) => ({
                        ...current,
                        sandboxConfig: { ...current.sandboxConfig, streamRunLogs: checked },
                      }))}
                  />
                </div>
              ) : null}

              {editingEnvironment &&
              editingEnvironment.driver === "sandbox" &&
              environmentForm.driver === "sandbox" ? (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 px-3 py-3">
                  <div className="text-sm font-medium">
                    {t("companySettings.customImage.title", { defaultValue: "Custom image" })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("companySettings.customImage.description", {
                      defaultValue: "Start a setup sandbox, SSH in to customize the instance, then capture the running machine as a reusable image for future runs.",
                    })}
                  </div>
                  <EnvironmentImageTemplatePanel
                    environment={editingEnvironment}
                    providerCapability={editingSandboxCapability}
                    providerDisplayName={editingSandboxDisplayName}
                  />
                </div>
              ) : null}

              <Field
                label={t("companySettings.environmentVariables", { defaultValue: "Environment variables" })}
                hint={t("companySettings.environmentVariablesHint", {
                  defaultValue: "Injected into runs that resolve through this environment. Use plain values or company secrets.",
                })}
              >
                <EnvVarEditor
                  value={environmentForm.envVars}
                  secrets={secrets ?? []}
                  onCreateSecret={async (name, value) => await createSecret.mutateAsync({ name, value })}
                  onChange={(env) =>
                    setEnvironmentForm((current) => ({ ...current, envVars: env ?? {} }))}
                />
              </Field>

              {environmentMutation.isError ? (
                <div className="text-xs text-destructive">
                  {environmentMutation.error instanceof Error
                    ? environmentMutation.error.message
                    : t("companySettings.failedToSaveEnvironment")}
                </div>
              ) : null}
              {draftEnvironmentProbeMutation.data ? (
                <div className={draftEnvironmentProbeMutation.data.ok ? "text-xs text-green-600" : "text-xs text-destructive"}>
                  {draftEnvironmentProbeMutation.data.summary}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 bg-background px-6 py-4">
            <Button
              variant="outline"
              onClick={closeEnvironmentDialog}
              disabled={environmentMutation.isPending}
            >
              {t("Cancel", { defaultValue: "Cancel" })}
            </Button>
            {environmentForm.driver !== "local" ? (
              <Button
                variant="outline"
                onClick={() => draftEnvironmentProbeMutation.mutate(environmentForm)}
                disabled={draftEnvironmentProbeMutation.isPending || !environmentFormValid}
              >
                {draftEnvironmentProbeMutation.isPending ? t("Testing...", { defaultValue: "Testing..." }) : t("Test", { defaultValue: "Test" })}
              </Button>
            ) : null}
            <Button
              onClick={() => environmentMutation.mutate(environmentForm)}
              disabled={environmentMutation.isPending || !environmentFormValid}
            >
              {environmentMutation.isPending
                ? editingEnvironmentId
                  ? t("Saving...", { defaultValue: "Saving..." })
                  : t("companySettings.creating")
                : editingEnvironmentId
                  ? t("companySettings.saveEnvironment")
                  : t("companySettings.createEnvironment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
