import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  AlertTriangle,
  ArchiveRestore,
  Archive,
  Ban,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Edit3,
  ExternalLink,
  KeyRound,
  Link2,
  Lock,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
  Filter,
  Info,
  Pencil,
  UserRound,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import type {
  CompanySecret,
  CompanySecretUsageBinding,
  CompanySecretProviderConfig,
  SecretProviderConfigDiscoveryCandidate,
  SecretProviderConfigDiscoveryPreviewResult,
  SecretAccessEvent,
  SecretManagedMode,
  SecretProvider,
  SecretProviderConfigStatus,
  SecretProviderDescriptor,
  SecretStatus,
  UserSecretCoverageSummary,
  UserSecretDefinition,
} from "@penclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import {
  secretsApi,
  type CreateSecretInput,
  type CreateSecretProviderConfigInput,
  type SecretProviderHealthResponse,
  type UpdateSecretProviderConfigInput,
} from "../api/secrets";
import { ApiError } from "../api/client";
import { accessApi, type CompanyUserDirectoryEntry } from "../api/access";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "../lib/utils";
import { copyTextToClipboard } from "../lib/clipboard";
import { PageTabBar } from "../components/PageTabBar";
import { ImportFromVaultDialog } from "./secrets/ImportFromVaultDialog";
import { humanizeEnumValue, translateStatusLabel } from "../lib/i18n-labels";
import { MyUserSecretsTab } from "./secrets/MyUserSecretsTab";
import { SetMyUserSecretDialog } from "./secrets/SetMyUserSecretDialog";
import {
  coverageSummaryLabel,
  UserSecretChip,
} from "./secrets/user-secret-presentation";
import type { MyUserSecretEntry } from "../api/secrets";

type CreateMode = "managed" | "external";
type SecretValueProvider = "company" | "user";
type ProvidedByFilter = "all" | SecretValueProvider;
type SecretsTab = "secrets" | "my-secrets" | "vaults";

type UnifiedSecretRow =
  | { id: string; kind: "company"; secret: CompanySecret }
  | { id: string; kind: "user"; definition: UserSecretDefinition };

type ProviderVaultForm = {
  provider: SecretProvider;
  displayName: string;
  status: SecretProviderConfigStatus;
  isDefault: boolean;
  backupReminderAcknowledged: boolean;
  region: string;
  namespace: string;
  secretNamePrefix: string;
  kmsKeyId: string;
  ownerTag: string;
  environmentTag: string;
  projectId: string;
  location: string;
  address: string;
  mountPath: string;
  secretPathPrefix: string;
};

type SafeProviderErrorDetails = {
  code?: string;
  provider?: string;
  operation?: string;
  providerConfigId?: string;
  providerVaultContext?: string;
  region?: string;
  credentialPath?: string;
  requiredCapability?: string;
  actionableMessage?: string;
  safeAlternative?: string;
};

const EMPTY_SECRETS: CompanySecret[] = [];
const EMPTY_USER_SECRET_DEFINITIONS: UserSecretDefinition[] = [];
const EMPTY_MY_USER_SECRETS: MyUserSecretEntry[] = [];
const EMPTY_SECRET_PROVIDERS: SecretProviderDescriptor[] = [];
const EMPTY_PROVIDER_CONFIGS: CompanySecretProviderConfig[] = [];

const PROVIDER_ORDER: SecretProvider[] = [
  "local_encrypted",
  "aws_secrets_manager",
  "gcp_secret_manager",
  "vault",
];

function defaultProviderVaultStatus(provider: SecretProvider): SecretProviderConfigStatus {
  return provider === "gcp_secret_manager" || provider === "vault" ? "coming_soon" : "ready";
}

function emptyProviderVaultForm(provider: SecretProvider = "local_encrypted"): ProviderVaultForm {
  return {
    provider,
    displayName: "",
    status: defaultProviderVaultStatus(provider),
    isDefault: false,
    backupReminderAcknowledged: false,
    region: "",
    namespace: "",
    secretNamePrefix: "",
    kmsKeyId: "",
    ownerTag: "",
    environmentTag: "",
    projectId: "",
    location: "",
    address: "",
    mountPath: "",
    secretPathPrefix: "",
  };
}

function providerConfigValue(config: CompanySecretProviderConfig["config"], key: string) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return "";
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function apiErrorDetails(error: unknown): SafeProviderErrorDetails | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  if (!body || typeof body !== "object") return null;
  const details = (body as Record<string, unknown>).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  return details as SafeProviderErrorDetails;
}

function apiErrorCode(error: unknown): string | null {
  return apiErrorDetails(error)?.code ?? null;
}

function isAwsDiscoveryAccessDenied(error: unknown): boolean {
  const details = apiErrorDetails(error);
  if (details?.provider === "aws_secrets_manager" && details.operation === "secret_provider_config.discovery.preview") {
    return details.code === "access_denied";
  }
  if (!(error instanceof ApiError)) return false;
  return apiErrorCode(error) === "access_denied";
}

function readableErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message || `Request failed: ${error.status}`;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

function providerVaultFormFromConfig(config: CompanySecretProviderConfig): ProviderVaultForm {
  return {
    ...emptyProviderVaultForm(config.provider),
    displayName: config.displayName,
    status: config.status,
    isDefault: config.isDefault,
    backupReminderAcknowledged:
      Boolean((config.config as Record<string, unknown> | undefined)?.backupReminderAcknowledged),
    region: providerConfigValue(config.config, "region"),
    namespace: providerConfigValue(config.config, "namespace"),
    secretNamePrefix: providerConfigValue(config.config, "secretNamePrefix"),
    kmsKeyId: providerConfigValue(config.config, "kmsKeyId"),
    ownerTag: providerConfigValue(config.config, "ownerTag"),
    environmentTag: providerConfigValue(config.config, "environmentTag"),
    projectId: providerConfigValue(config.config, "projectId"),
    location: providerConfigValue(config.config, "location"),
    address: providerConfigValue(config.config, "address"),
    mountPath: providerConfigValue(config.config, "mountPath"),
    secretPathPrefix: providerConfigValue(config.config, "secretPathPrefix"),
  };
}

function formatRelative(value: Date | string | null | undefined, t: TFunction): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  if (diff < 0) return date.toLocaleString();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return t("relative.secondsAgoShort", { count: seconds, defaultValue: "{{count}}s ago" });
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t("relative.minutesAgoShort", { count: minutes, defaultValue: "{{count}}m ago" });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t("relative.hoursAgoShort", { count: hours, defaultValue: "{{count}}h ago" });
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return t("relative.daysAgoShort", { count: days, defaultValue: "{{count}}d ago" });
  }
  return date.toLocaleDateString();
}

function statusTextTone(status: SecretStatus) {
  switch (status) {
    case "active":
      return "text-emerald-700 dark:text-emerald-300";
    case "disabled":
      return "text-amber-700 dark:text-amber-300";
    case "archived":
      return "text-muted-foreground";
    case "deleted":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function providerLabel(providers: SecretProviderDescriptor[] | undefined, id: SecretProvider, t?: TFunction) {
  if (id === "local_encrypted") {
    return t?.("secrets.provider.localEncryptedDefault", { defaultValue: "Local encrypted (default)" }) ?? "Local encrypted (default)";
  }
  return providers?.find((p) => p.id === id)?.label ?? id.replaceAll("_", " ");
}

function normalizeSecretKeyForPreview(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeUserSecretKeyForPreview(input: string) {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}


function modeLabel(managedMode: SecretManagedMode, t: TFunction) {
  return managedMode === "paperclip_managed"
    ? t("secrets.mode.paperclipManaged", { defaultValue: "Paperclip-managed" })
    : t("secrets.mode.linkedExternal", { defaultValue: "Linked external" });
}

function modeDescription(managedMode: SecretManagedMode, t: TFunction) {
  return managedMode === "paperclip_managed"
    ? t("secrets.mode.paperclipManagedDescription", {
        defaultValue: "Paperclip owns create and rotation writes for this provider secret.",
      })
    : t("secrets.mode.linkedExternalDescription", {
        defaultValue: "Paperclip resolves this provider reference but does not rotate the provider value.",
      });
}

function statusDotTone(status: SecretStatus) {
  switch (status) {
    case "active":
      return "bg-emerald-500";
    case "disabled":
      return "bg-amber-500";
    case "archived":
      return "bg-muted-foreground";
    case "deleted":
      return "bg-destructive";
    default:
      return "bg-muted-foreground";
  }
}

function StatusBadge({ status }: { status: SecretStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", statusTextTone(status))}>
      <span className={cn("h-1.5 w-1.5 rounded-full", statusDotTone(status))} aria-hidden="true" />
      {translateStatusLabel(t, status)}
    </span>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-(length:--text-micro) text-muted-foreground">
      {children}
    </span>
  );
}

function providerIndicatorLabel(
  secret: CompanySecret,
  providers: SecretProviderDescriptor[],
  providerConfigs: CompanySecretProviderConfig[],
  t: TFunction,
) {
  const provider = providerLabel(providers, secret.provider, t);
  const vault = providerVaultLabel(providerConfigs, secret.providerConfigId, t);
  const custody = modeLabel(secret.managedMode, t);
  return [
    `${custody} · ${provider}`,
    vault ? t("secrets.vaultNamed", { name: vault, defaultValue: "Vault: {{name}}" }) : null,
    secret.externalRef
      ? t("secrets.referenceNamed", { reference: secret.externalRef, defaultValue: "Reference: {{reference}}" })
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function SecretProviderIndicator({
  secret,
  providers,
  providerConfigs,
}: {
  secret: CompanySecret;
  providers: SecretProviderDescriptor[];
  providerConfigs: CompanySecretProviderConfig[];
}) {
  const { t } = useTranslation();
  const label = providerIndicatorLabel(secret, providers, providerConfigs, t);
  const Icon = secret.managedMode === "external_reference" ? ExternalLink : Lock;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground"
        >
          <Icon className="h-3 w-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 whitespace-pre-wrap break-words">{label}</TooltipContent>
    </Tooltip>
  );
}

function UpdatedWithTooltip({
  updatedAt,
  tooltip,
}: {
  updatedAt: Date | string | null | undefined;
  tooltip: string;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={tooltip}
          className="inline-flex cursor-help border-b border-dotted border-muted-foreground/60 text-xs text-muted-foreground"
        >
          {formatRelative(updatedAt, t)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 whitespace-pre-wrap">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function healthEntryForProvider(
  health: SecretProviderHealthResponse | null,
  providerId: SecretProvider,
) {
  return health?.providers.find((entry) => entry.provider === providerId) ?? null;
}

function translateProviderHealthText(t: TFunction, text: string): string {
  const missingKeyFile = text.match(/^Secrets key file does not exist yet: (.+)$/);
  if (missingKeyFile) {
    return t("secrets.health.localKeyFileMissing", {
      path: missingKeyFile[1],
      defaultValue: "Secrets key file does not exist yet: {{path}}",
    });
  }
  const missingAwsConfig = text.match(/^AWS Secrets Manager provider is not ready: missing (.+)\.$/);
  if (missingAwsConfig) {
    return t("secrets.health.awsMissingConfig", {
      names: missingAwsConfig[1],
      defaultValue: "AWS Secrets Manager provider is not ready: missing {{names}}.",
    });
  }
  const missingProviderConfig = text.match(/^Missing required non-secret AWS provider config: (.+)\.$/);
  if (missingProviderConfig) {
    return t("secrets.health.awsMissingProviderConfig", {
      names: missingProviderConfig[1],
      defaultValue: "Missing required non-secret AWS provider config: {{names}}.",
    });
  }
  const externalUnavailable = text.match(/^(.+) provider is available for external references but not configured for runtime resolution$/);
  if (externalUnavailable) {
    return t("secrets.health.externalRuntimeNotConfigured", {
      provider: externalUnavailable[1],
      defaultValue: "{{provider}} provider is available for external references but not configured for runtime resolution",
    });
  }
  const exact: Record<string, string> = {
    "PAPERCLIP_SECRETS_MASTER_KEY is invalid; expected 32-byte base64, 64-char hex, or raw 32-char string":
      "secrets.health.invalidMasterKey",
    "Local encrypted provider is using PAPERCLIP_SECRETS_MASTER_KEY":
      "secrets.health.localUsingEnvKey",
    "The first managed secret write will create this key file with 0600 permissions.":
      "secrets.health.localFirstWriteCreatesKey",
    "Back up the configured master key separately from the database.":
      "secrets.health.backupConfiguredMasterKey",
    "A restore needs both the database metadata and the same master key.":
      "secrets.health.restoreNeedsDatabaseAndKey",
    "Back up the key file together with database backups.":
      "secrets.health.backupKeyFileWithDatabase",
    "The database alone cannot restore local encrypted secret values.":
      "secrets.health.databaseAloneCannotRestore",
    "AWS bootstrap credentials must be available to the Paperclip server runtime through the AWS SDK default credential provider chain: IAM role/workload identity, AWS_PROFILE/SSO/shared credentials, web identity, container/instance metadata, or short-lived shell credentials.":
      "secrets.health.awsRuntimeCredentialWarning",
    "Do not store AWS root credentials or long-lived IAM user access keys in Paperclip company_secrets; the AWS provider bootstrap belongs in deployment infrastructure, the process environment, an AWS profile, or the orchestrator secret store.":
      "secrets.health.awsCredentialCustodyWarning",
    "Managed secret create/rotate/resolve calls will fail until AWS provider configuration is complete.":
      "secrets.health.awsManagedCallsFailUntilConfigured",
    "Back up Paperclip metadata separately from AWS-managed secrets.":
      "secrets.health.awsBackupMetadata",
    "Restoring access requires the Paperclip database plus the same AWS secret namespace and KMS permissions.":
      "secrets.health.awsRestoreRequirements",
    "Linked external references can be stored as metadata, but runtime resolution will fail until this provider is configured.":
      "secrets.health.externalReferencesMetadataOnly",
  };
  const key = exact[text];
  return key ? t(key, { defaultValue: text }) : text;
}

export function getCreateProviderBlockReason(
  provider: SecretProviderDescriptor | null | undefined,
  mode: CreateMode,
  health: SecretProviderHealthResponse | null,
  providerConfig?: CompanySecretProviderConfig | null,
  t?: TFunction,
) {
  const displayLabel = provider ? providerLabel([provider], provider.id, t) : null;
  if (!provider) {
    return t?.("secrets.providerBlock.selectProvider", { defaultValue: "Select a provider." }) ?? "Select a provider.";
  }
  if (mode === "managed" && provider.supportsManagedValues === false) {
    return t?.("secrets.providerBlock.managedUnsupported", {
      provider: displayLabel,
      defaultValue: "{{provider}} does not support Paperclip-managed secret values.",
    }) ?? `${provider.label} does not support Paperclip-managed secret values.`;
  }
  if (mode === "external" && provider.supportsExternalReferences === false) {
    return t?.("secrets.providerBlock.externalUnsupported", {
      provider: displayLabel,
      defaultValue: "{{provider}} does not support linked external references.",
    }) ?? `${provider.label} does not support linked external references.`;
  }
  const selectedProviderConfigBlockReason = providerConfig?.provider === provider.id
    ? getProviderConfigBlockReason(providerConfig, t)
    : null;
  const selectedProviderConfigReady =
    providerConfig?.provider === provider.id && !selectedProviderConfigBlockReason;
  if (provider.configured === false) {
    if (selectedProviderConfigReady) return null;
    if (selectedProviderConfigBlockReason) return selectedProviderConfigBlockReason;
    const healthEntry = healthEntryForProvider(health, provider.id);
    const message = healthEntry?.message && t
      ? translateProviderHealthText(t, healthEntry.message)
      : healthEntry?.message;
    const deploymentMessage = t?.("secrets.providerBlock.deploymentDefaultNotConfigured", {
      provider: displayLabel,
      defaultValue: "Deployment default {{provider}} is not configured.",
    }) ?? `Deployment default ${provider.label} is not configured.`;
    const nextStep = t?.("secrets.providerBlock.selectReadyVaultOrConfigureDefault", {
      defaultValue: "Select a ready provider vault or configure the deployment default.",
    }) ?? "Select a ready provider vault or configure the deployment default.";
    return healthEntry?.message
      ? `${deploymentMessage} ${nextStep} ${message}`
      : `${deploymentMessage} ${nextStep}`;
  }
  const healthEntry = healthEntryForProvider(health, provider.id);
  if (healthEntry?.status === "error") {
    return t?.("secrets.providerBlock.healthCheckFailed", {
      provider: displayLabel,
      message: healthEntry.message,
      defaultValue: "{{provider}} health check failed: {{message}}",
    }) ?? `${provider.label} health check failed: ${healthEntry.message}`;
  }
  return null;
}

function providerHealthText(
  provider: SecretProviderDescriptor | null | undefined,
  health: SecretProviderHealthResponse | null,
  t: TFunction,
  providerConfig?: CompanySecretProviderConfig | null,
) {
  if (!provider) return null;
  if (
    provider.configured === false &&
    providerConfig?.provider === provider.id &&
    !getProviderConfigBlockReason(providerConfig, t)
  ) {
    return t("secrets.providerBlock.usingSelectedVaultDeploymentDefaultMissing", {
      provider: providerLabel([provider], provider.id, t),
      defaultValue: "Using selected provider vault. Deployment default {{provider}} is not configured.",
    });
  }
  const entry = healthEntryForProvider(health, provider.id);
  if (!entry) return null;
  const message = entry.message ? translateProviderHealthText(t, entry.message) : null;
  const warnings = entry.warnings?.map((warning) => translateProviderHealthText(t, warning)).join(" ");
  return [message, warnings].filter(Boolean).join(" ");
}

function detailString(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getProviderConfigBlockReason(
  config: CompanySecretProviderConfig | null | undefined,
  t?: TFunction,
) {
  if (!config) return null;
  if (config.status === "disabled") {
    return t?.("secrets.providerBlock.vaultDisabled", { defaultValue: "This provider vault is disabled." }) ?? "This provider vault is disabled.";
  }
  if (config.status === "coming_soon") {
    return t?.("secrets.providerBlock.vaultDraftOnly", { defaultValue: "This provider vault is saved as draft metadata only." }) ?? "This provider vault is saved as draft metadata only.";
  }
  if (config.healthStatus === "error") {
    return config.healthMessage ?? t?.("secrets.providerBlock.vaultHealthCheckFailed", { defaultValue: "This provider vault health check failed." }) ?? "This provider vault health check failed.";
  }
  return null;
}

export function getSelectableProviderConfig(
  configs: CompanySecretProviderConfig[],
  provider: SecretProvider,
) {
  const providerConfigs = configs.filter((config) => config.provider === provider);
  return (
    providerConfigs.find((config) => config.isDefault && !getProviderConfigBlockReason(config)) ??
    providerConfigs.find((config) => !getProviderConfigBlockReason(config)) ??
    null
  );
}

export function getDefaultProviderConfigId(
  configs: CompanySecretProviderConfig[],
  provider: SecretProvider,
) {
  const selected = getSelectableProviderConfig(configs, provider);
  const providerConfigs = configs.filter((config) => config.provider === provider);
  return (
    selected?.id ??
    providerConfigs.find((config) => config.isDefault)?.id ??
    ""
  );
}

export function findCreateProviderReplacement({
  providers,
  providerConfigs,
  currentProvider,
  mode,
  health,
}: {
  providers: SecretProviderDescriptor[];
  providerConfigs: CompanySecretProviderConfig[];
  currentProvider: SecretProvider;
  mode: CreateMode;
  health: SecretProviderHealthResponse | null;
}) {
  return (
    providers.find((provider) => {
      const selectedConfig =
        provider.id === currentProvider
          ? providerConfigs.find(
              (config) => config.provider === provider.id && !getProviderConfigBlockReason(config),
            ) ?? null
          : getSelectableProviderConfig(providerConfigs, provider.id);
      return !getCreateProviderBlockReason(provider, mode, health, selectedConfig);
    }) ?? null
  );
}

function providerVaultLabel(configs: CompanySecretProviderConfig[], id: string | null | undefined, t?: TFunction) {
  if (!id) return t?.("secrets.deploymentDefault", { defaultValue: "Deployment default" }) ?? "Deployment default";
  return configs.find((config) => config.id === id)?.displayName
    ?? t?.("secrets.unknownVault", { defaultValue: "Unknown vault" })
    ?? "Unknown vault";
}

function buildProviderVaultConfig(form: ProviderVaultForm): Record<string, unknown> {
  const compact = (value: string) => value.trim() || null;
  switch (form.provider) {
    case "local_encrypted":
      return { backupReminderAcknowledged: form.backupReminderAcknowledged };
    case "aws_secrets_manager":
      return {
        region: form.region.trim(),
        namespace: compact(form.namespace),
        secretNamePrefix: compact(form.secretNamePrefix),
        kmsKeyId: compact(form.kmsKeyId),
        ownerTag: compact(form.ownerTag),
        environmentTag: compact(form.environmentTag),
      };
    case "gcp_secret_manager":
      return {
        projectId: compact(form.projectId),
        location: compact(form.location),
        namespace: compact(form.namespace),
        secretNamePrefix: compact(form.secretNamePrefix),
      };
    case "vault":
      return {
        address: compact(form.address),
        namespace: compact(form.namespace),
        mountPath: compact(form.mountPath),
        secretPathPrefix: compact(form.secretPathPrefix),
      };
    default:
      return {};
  }
}

function getAwsProviderVaultDiscoveryQuery(form: ProviderVaultForm): string | null {
  return (
    form.secretNamePrefix.trim() ||
    form.namespace.trim() ||
    form.environmentTag.trim() ||
    form.ownerTag.trim() ||
    null
  );
}

export function getAwsManagedPathPreview(input: {
  provider: SecretProviderDescriptor | null | undefined;
  health: SecretProviderHealthResponse | null;
  companyId: string;
  secretKeySource: string;
}) {
  if (input.provider?.id !== "aws_secrets_manager") return null;
  const healthEntry = healthEntryForProvider(input.health, "aws_secrets_manager");
  const prefix = detailString(healthEntry?.details, "prefix") ?? "paperclip";
  const deploymentId = detailString(healthEntry?.details, "deploymentId") ?? "{deploymentId}";
  const secretKey = normalizeSecretKeyForPreview(input.secretKeySource) || "{secretKey}";
  return `${prefix}/${deploymentId}/${input.companyId}/${secretKey}`;
}

export function Secrets() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const [activeTab, setActiveTab] = useState<SecretsTab>("secrets");
  const [secretDetailTab, setSecretDetailTab] = useState("details");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SecretStatus | "all">("active");
  const [providerFilter, setProviderFilter] = useState<SecretProvider | "all">("all");
  const [providedByFilter, setProvidedByFilter] = useState<ProvidedByFilter>("all");
  const [selectedSecretId, setSelectedSecretId] = useState<string | null>(null);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null);
  const [usageDialogSecretId, setUsageDialogSecretId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importInitialVaultId, setImportInitialVaultId] = useState<string | null>(null);
  const [secretValueProvider, setSecretValueProvider] = useState<SecretValueProvider>("company");
  const [createMode, setCreateMode] = useState<CreateMode>("managed");
  const [editingDefinition, setEditingDefinition] = useState<UserSecretDefinition | null>(null);
  const [createKeyDirty, setCreateKeyDirty] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    key: "",
    value: "",
    description: "",
    usageGuidance: "",
    externalRef: "",
    provider: "local_encrypted" as SecretProvider,
    providerConfigId: "",
  });
  const [createError, setCreateError] = useState<unknown>(null);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateValue, setRotateValue] = useState("");
  const [rotateExternalRef, setRotateExternalRef] = useState("");
  const [rotateProviderConfigId, setRotateProviderConfigId] = useState("");
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CompanySecret | null>(null);
  const [definitionDeleteConfirm, setDefinitionDeleteConfirm] = useState<UserSecretDefinition | null>(null);
  const [setMyValueFor, setSetMyValueFor] = useState<MyUserSecretEntry | null>(null);
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [editingVault, setEditingVault] = useState<CompanySecretProviderConfig | null>(null);
  const [removeVaultConfirm, setRemoveVaultConfirm] = useState<CompanySecretProviderConfig | null>(null);
  const [vaultForm, setVaultForm] = useState<ProviderVaultForm>(() => emptyProviderVaultForm());
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultDiscovery, setVaultDiscovery] =
    useState<SecretProviderConfigDiscoveryPreviewResult | null>(null);
  const [vaultDiscoveryError, setVaultDiscoveryError] = useState<unknown | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: t("Secrets", { defaultValue: "Secrets" }) }]);
  }, [setBreadcrumbs, t]);

  const secretsQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.secrets.list(selectedCompanyId)
      : ["secrets", "__disabled__"],
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const userDefinitionsQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.secrets.userDefinitions(selectedCompanyId)
      : ["user-secret-definitions", "__disabled__"],
    queryFn: () => secretsApi.listUserSecretDefinitions(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const myUserSecretsQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.secrets.myUserSecrets(selectedCompanyId)
      : ["my-user-secrets", "__disabled__"],
    queryFn: () => secretsApi.listMyUserSecrets(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const providersQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.secrets.providers(selectedCompanyId)
      : ["secret-providers", "__disabled__"],
    queryFn: () => secretsApi.providers(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    staleTime: 5 * 60_000,
  });

  const providerHealthQuery = useQuery({
    queryKey: selectedCompanyId
      ? ["secret-provider-health", selectedCompanyId]
      : ["secret-provider-health", "__disabled__"],
    queryFn: () => secretsApi.providerHealth(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    refetchInterval: 60_000,
    retry: false,
  });

  const providerConfigsQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.secrets.providerConfigs(selectedCompanyId)
      : ["secret-provider-configs", "__disabled__"],
    queryFn: () => secretsApi.providerConfigs(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    retry: false,
  });

  const secrets = secretsQuery.data ?? EMPTY_SECRETS;
  const userDefinitions = userDefinitionsQuery.data ?? EMPTY_USER_SECRET_DEFINITIONS;
  const myUserSecrets = myUserSecretsQuery.data ?? EMPTY_MY_USER_SECRETS;
  const providers = providersQuery.data ?? EMPTY_SECRET_PROVIDERS;
  const providerConfigs = providerConfigsQuery.data ?? EMPTY_PROVIDER_CONFIGS;
  const selectedSecret = useMemo(
    () => secrets.find((secret) => secret.id === selectedSecretId) ?? null,
    [secrets, selectedSecretId],
  );
  const selectedDefinition = useMemo(
    () => userDefinitions.find((definition) => definition.id === selectedDefinitionId) ?? null,
    [selectedDefinitionId, userDefinitions],
  );
  const selectedDefinitionMyEntry = useMemo(() => {
    if (!selectedDefinition) return null;
    return myUserSecrets.find((entry) => entry.definition.id === selectedDefinition.id) ?? {
      definition: selectedDefinition,
      secret: null,
    };
  }, [myUserSecrets, selectedDefinition]);
  const usageDialogSecret = useMemo(
    () => secrets.find((secret) => secret.id === usageDialogSecretId) ?? null,
    [secrets, usageDialogSecretId],
  );
  const selectedCreateProvider = useMemo(
    () => providers.find((provider) => provider.id === createForm.provider) ?? null,
    [providers, createForm.provider],
  );
  const createProviderConfigs = useMemo(
    () => providerConfigs.filter((config) => config.provider === createForm.provider),
    [createForm.provider, providerConfigs],
  );
  const selectedCreateProviderConfig = useMemo(
    () => providerConfigs.find((config) => config.id === createForm.providerConfigId) ?? null,
    [createForm.providerConfigId, providerConfigs],
  );
  const selectedRotateProviderConfigs = useMemo(
    () => providerConfigs.filter((config) => config.provider === selectedSecret?.provider),
    [providerConfigs, selectedSecret?.provider],
  );
  const selectedRotateProviderConfig = useMemo(
    () => providerConfigs.find((config) => config.id === rotateProviderConfigId) ?? null,
    [providerConfigs, rotateProviderConfigId],
  );
  const createProviderBlockReason = getCreateProviderBlockReason(
    selectedCreateProvider,
    createMode,
    providerHealthQuery.data ?? null,
    selectedCreateProviderConfig,
    t,
  ) ?? getProviderConfigBlockReason(selectedCreateProviderConfig, t);
  const rotateProviderBlockReason = getProviderConfigBlockReason(selectedRotateProviderConfig, t);
  const createProviderHealthText = providerHealthText(
    selectedCreateProvider,
    providerHealthQuery.data ?? null,
    t,
    selectedCreateProviderConfig,
  ) ?? getProviderConfigBlockReason(selectedCreateProviderConfig, t);
  const awsManagedPathPreview = getAwsManagedPathPreview({
    provider: selectedCreateProvider,
    health: providerHealthQuery.data ?? null,
    companyId: selectedCompanyId ?? "{companyId}",
    secretKeySource: createForm.key.trim() || createForm.name,
  });

  const unifiedRows = useMemo<UnifiedSecretRow[]>(
    () => [
      ...secrets.map((secret) => ({ id: `company:${secret.id}`, kind: "company" as const, secret })),
      ...userDefinitions.map((definition) => ({
        id: `user:${definition.id}`,
        kind: "user" as const,
        definition,
      })),
    ],
    [secrets, userDefinitions],
  );

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return unifiedRows.filter((row) => {
      const providedBy: SecretValueProvider = row.kind === "company" ? "company" : "user";
      const status = row.kind === "company" ? row.secret.status : row.definition.status;
      if (providedByFilter !== "all" && providedBy !== providedByFilter) return false;
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (providerFilter !== "all" && row.kind === "company" && row.secret.provider !== providerFilter) {
        return false;
      }
      if (!needle) return true;
      if (row.kind === "company") {
        return (
          row.secret.name.toLowerCase().includes(needle) ||
          row.secret.key.toLowerCase().includes(needle) ||
          (row.secret.description?.toLowerCase().includes(needle) ?? false) ||
          (row.secret.externalRef?.toLowerCase().includes(needle) ?? false)
        );
      }
      return (
        row.definition.name.toLowerCase().includes(needle) ||
        row.definition.key.toLowerCase().includes(needle) ||
        (row.definition.description?.toLowerCase().includes(needle) ?? false) ||
        (row.definition.usageGuidance?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [providedByFilter, providerFilter, search, statusFilter, unifiedRows]);
  const activeSecretFilterCount =
    (statusFilter === "active" ? 0 : 1) +
    (providerFilter === "all" ? 0 : 1) +
    (providedByFilter === "all" ? 0 : 1);

  const usageQuery = useQuery({
    queryKey: selectedSecret ? queryKeys.secrets.usage(selectedSecret.id) : ["secrets", "usage", "__disabled__"],
    queryFn: () => secretsApi.usage(selectedSecret!.id),
    enabled: Boolean(selectedSecret),
  });
  const eventsQuery = useQuery({
    queryKey: selectedSecret
      ? queryKeys.secrets.accessEvents(selectedSecret.id)
      : ["secrets", "access-events", "__disabled__"],
    queryFn: () => secretsApi.accessEvents(selectedSecret!.id),
    enabled: Boolean(selectedSecret),
  });

  const usageDialogQuery = useQuery({
    queryKey: usageDialogSecret
      ? queryKeys.secrets.usage(usageDialogSecret.id)
      : ["secrets", "usage-dialog", "__disabled__"],
    queryFn: () => secretsApi.usage(usageDialogSecret!.id),
    enabled: Boolean(usageDialogSecret),
  });

  function invalidateAll(extraIds: string[] = []) {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets.userDefinitions(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets.myUserSecrets(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.secrets.providerConfigs(selectedCompanyId) });
    for (const id of extraIds) {
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.usage(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.accessEvents(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.userDefinitionCoverage(selectedCompanyId, id) });
    }
  }

  function openCreateSecret() {
    setEditingDefinition(null);
    setSecretValueProvider("company");
    setCreateMode("managed");
    setCreateKeyDirty(false);
    setCreateError(null);
    setCreateForm({
      name: "",
      key: "",
      value: "",
      description: "",
      usageGuidance: "",
      externalRef: "",
      provider: "local_encrypted",
      providerConfigId: getDefaultProviderConfigId(providerConfigs, "local_encrypted"),
    });
    setCreateOpen(true);
  }

  function openEditDefinition(definition: UserSecretDefinition) {
    setEditingDefinition(definition);
    setSecretValueProvider("user");
    setCreateMode("managed");
    setCreateKeyDirty(true);
    setCreateError(null);
    setCreateForm({
      name: definition.name,
      key: definition.key,
      value: "",
      description: definition.description ?? "",
      usageGuidance: definition.usageGuidance ?? "",
      externalRef: "",
      provider: "local_encrypted",
      providerConfigId: "",
    });
    setCreateOpen(true);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const sharedDefinitionPayload = {
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
        usageGuidance: createForm.usageGuidance.trim() || null,
      };
      if (editingDefinition) {
        const definition = await secretsApi.updateUserSecretDefinition(
          selectedCompanyId!,
          editingDefinition.id,
          sharedDefinitionPayload,
        );
        return { kind: "user" as const, item: definition, action: "updated" as const };
      }
      if (secretValueProvider === "user") {
        const definition = await secretsApi.createUserSecretDefinition(selectedCompanyId!, {
          ...sharedDefinitionPayload,
          key: createForm.key.trim(),
          status: "active",
        });
        return { kind: "user" as const, item: definition, action: "created" as const };
      }

      const input: CreateSecretInput = {
        name: createForm.name.trim(),
        provider: createForm.provider,
        providerConfigId: createForm.providerConfigId || null,
        managedMode: createMode === "external" ? "external_reference" : "paperclip_managed",
        description: createForm.description.trim() || null,
      };
      if (createForm.key.trim()) input.key = createForm.key.trim();
      if (createMode === "managed") {
        input.value = createForm.value;
      } else {
        input.externalRef = createForm.externalRef.trim();
      }
      const secret = await secretsApi.create(selectedCompanyId!, input);
      return { kind: "company" as const, item: secret, action: "created" as const };
    },
    onSuccess: (result) => {
      pushToast({
        title:
          result.kind === "company"
            ? t("secrets.toast.secretCreated", { defaultValue: "Secret created" })
            : result.action === "updated"
              ? t("secrets.toast.userSecretUpdated", { defaultValue: "User-provided secret updated" })
              : t("secrets.toast.userSecretCreated", { defaultValue: "User-provided secret created" }),
        body: result.item.name,
        tone: "success",
      });
      setCreateOpen(false);
      setEditingDefinition(null);
      setSecretValueProvider("company");
      setCreateKeyDirty(false);
      setCreateForm({
        name: "",
        key: "",
        value: "",
        description: "",
        usageGuidance: "",
        externalRef: "",
        provider: createForm.provider,
        providerConfigId: getDefaultProviderConfigId(providerConfigs, createForm.provider),
      });
      setCreateError(null);
      if (result.kind === "company") {
        setSelectedSecretId(result.item.id);
        setSelectedDefinitionId(null);
        invalidateAll([result.item.id]);
      } else {
        setSelectedDefinitionId(result.item.id);
        setSelectedSecretId(null);
        invalidateAll([result.item.id]);
      }
    },
    onError: (error) => {
      setCreateError(error);
    },
  });

  const rotateMutation = useMutation({
    mutationFn: () => {
      if (!selectedSecret) throw new Error(t("secrets.selectSecretFirst", { defaultValue: "Select a secret first" }));
      if (selectedSecret.managedMode === "external_reference") {
        return secretsApi.rotate(selectedSecret.id, {
          externalRef: rotateExternalRef.trim() || selectedSecret.externalRef || undefined,
          providerConfigId: rotateProviderConfigId || null,
        });
      }
      return secretsApi.rotate(selectedSecret.id, {
        value: rotateValue,
        providerConfigId: rotateProviderConfigId || null,
      });
    },
    onSuccess: (updated) => {
      pushToast({ title: t("secrets.toast.rotated", { defaultValue: "Rotated" }), body: `${updated.name} -> v${updated.latestVersion}`, tone: "success" });
      setRotateOpen(false);
      setRotateValue("");
      setRotateExternalRef("");
      setRotateProviderConfigId("");
      setRotateError(null);
      invalidateAll([updated.id]);
    },
    onError: (error) => {
      setRotateError(error instanceof Error ? error.message : t("secrets.toast.rotateFailed", { defaultValue: "Rotate failed" }));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SecretStatus }) => {
      switch (status) {
        case "active":
          return secretsApi.enable(id);
        case "disabled":
          return secretsApi.disable(id);
        case "archived":
          return secretsApi.archive(id);
        default:
          return secretsApi.update(id, { status });
      }
    },
    onSuccess: (updated) => {
      pushToast({
        title: t("secrets.toast.secretStatusUpdated", {
          status: translateStatusLabel(t, updated.status),
          defaultValue: "Secret {{status}}",
        }),
        body: updated.name,
        tone: "info",
      });
      invalidateAll([updated.id]);
    },
    onError: (error) => {
      pushToast({
        title: t("secrets.toast.statusUpdateFailed", { defaultValue: "Status update failed" }),
        body: error instanceof Error ? error.message : t("common.tryAgain", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const definitionStatusMutation = useMutation({
    mutationFn: ({ definition, status }: { definition: UserSecretDefinition; status: SecretStatus }) =>
      secretsApi.updateUserSecretDefinition(selectedCompanyId!, definition.id, { status }),
    onSuccess: (updated) => {
      pushToast({
        title: t("secrets.toast.userSecretStatusUpdated", {
          status: translateStatusLabel(t, updated.status),
          defaultValue: "User-provided secret {{status}}",
        }),
        body: updated.name,
        tone: "info",
      });
      invalidateAll([updated.id]);
    },
    onError: (error) => {
      pushToast({
        title: t("secrets.toast.statusUpdateFailed", { defaultValue: "Status update failed" }),
        body: error instanceof Error ? error.message : t("common.tryAgain", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => secretsApi.remove(id),
    onSuccess: (_response, id) => {
      pushToast({ title: t("secrets.toast.secretDeleted", { defaultValue: "Secret deleted" }), tone: "info" });
      setDeleteConfirm(null);
      if (selectedSecretId === id) setSelectedSecretId(null);
      invalidateAll([id]);
    },
    onError: (error) => {
      pushToast({
        title: t("secrets.toast.deleteFailed", { defaultValue: "Delete failed" }),
        body: error instanceof Error ? error.message : t("common.tryAgain", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const deleteDefinitionMutation = useMutation({
    mutationFn: (definition: UserSecretDefinition) =>
      secretsApi.removeUserSecretDefinition(selectedCompanyId!, definition.id),
    onSuccess: (_response, definition) => {
      pushToast({
        title: t("secrets.toast.userSecretRemoved", { defaultValue: "User-provided secret removed" }),
        body: definition.name,
        tone: "info",
      });
      setDefinitionDeleteConfirm(null);
      if (selectedDefinitionId === definition.id) setSelectedDefinitionId(null);
      invalidateAll([definition.id]);
    },
    onError: (error) => {
      pushToast({
        title: t("secrets.toast.deleteFailed", { defaultValue: "Delete failed" }),
        body: error instanceof Error ? error.message : t("common.tryAgain", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const saveVaultMutation = useMutation({
    mutationFn: () => {
      const data: CreateSecretProviderConfigInput | UpdateSecretProviderConfigInput = {
        displayName: vaultForm.displayName.trim(),
        status: vaultForm.status,
        isDefault: vaultForm.isDefault,
        config: buildProviderVaultConfig(vaultForm),
      };
      if (editingVault) {
        return secretsApi.updateProviderConfig(editingVault.id, data);
      }
      return secretsApi.createProviderConfig(selectedCompanyId!, {
        ...(data as UpdateSecretProviderConfigInput),
        provider: vaultForm.provider,
      } as CreateSecretProviderConfigInput);
    },
    onSuccess: (saved) => {
      pushToast({
        title: editingVault
          ? t("secrets.toast.providerVaultUpdated", { defaultValue: "Provider vault updated" })
          : t("secrets.toast.providerVaultCreated", { defaultValue: "Provider vault created" }),
        body: saved.displayName,
        tone: "success",
      });
      setVaultDialogOpen(false);
      setEditingVault(null);
      setVaultForm(emptyProviderVaultForm());
      setVaultError(null);
      invalidateAll();
    },
    onError: (error) => {
      setVaultError(error instanceof ApiError ? error.message : (error as Error).message);
    },
  });

  const discoverVaultMutation = useMutation({
    mutationFn: () =>
      secretsApi.providerConfigDiscoveryPreview(selectedCompanyId!, {
        provider: "aws_secrets_manager",
        config: buildProviderVaultConfig(vaultForm),
        query: getAwsProviderVaultDiscoveryQuery(vaultForm),
        pageSize: 25,
      }),
    onSuccess: (preview) => {
      setVaultDiscovery(preview);
      setVaultDiscoveryError(null);
    },
    onError: (error) => {
      setVaultDiscovery(null);
      setVaultDiscoveryError(error);
    },
  });

  const disableVaultMutation = useMutation({
    mutationFn: (id: string) => secretsApi.disableProviderConfig(id),
    onSuccess: (updated) => {
      pushToast({ title: t("secrets.toast.providerVaultDisabled", { defaultValue: "Provider vault disabled" }), body: updated.displayName, tone: "info" });
      invalidateAll();
    },
    onError: (error) => {
      pushToast({
        title: t("secrets.toast.disableFailed", { defaultValue: "Disable failed" }),
        body: error instanceof Error ? error.message : t("common.tryAgain", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const removeVaultMutation = useMutation({
    mutationFn: (id: string) => secretsApi.removeProviderConfig(id),
    onSuccess: (removed) => {
      pushToast({
        title: t("secrets.providerVaultRemoved", { defaultValue: "Provider vault removed" }),
        body: t("secrets.providerVaultRemovedBody", {
          name: removed.displayName,
          defaultValue: "{{name}} was removed from Paperclip only.",
        }),
        tone: "info",
      });
      setRemoveVaultConfirm(null);
      invalidateAll();
    },
    onError: (error) => {
      pushToast({
        title: t("secrets.removeFailed", { defaultValue: "Remove failed" }),
        body: error instanceof Error ? error.message : t("common.tryAgain", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const defaultVaultMutation = useMutation({
    mutationFn: (id: string) => secretsApi.setDefaultProviderConfig(id),
    onSuccess: (updated) => {
      pushToast({ title: t("secrets.toast.defaultVaultSet", { defaultValue: "Default vault set" }), body: updated.displayName, tone: "success" });
      invalidateAll();
    },
    onError: (error) => {
      pushToast({
        title: t("secrets.toast.defaultUpdateFailed", { defaultValue: "Default update failed" }),
        body: error instanceof Error ? error.message : t("common.tryAgain", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  const healthVaultMutation = useMutation({
    mutationFn: (id: string) => secretsApi.checkProviderConfigHealth(id),
    onSuccess: (health) => {
      pushToast({ title: t("secrets.toast.healthChecked", { defaultValue: "Health checked" }), body: health.message, tone: health.status === "error" ? "error" : "info" });
      invalidateAll();
    },
    onError: (error) => {
      pushToast({
        title: t("secrets.toast.healthCheckFailed", { defaultValue: "Health check failed" }),
        body: error instanceof Error ? error.message : t("common.tryAgain", { defaultValue: "Try again" }),
        tone: "error",
      });
    },
  });

  useEffect(() => {
    if (!createOpen || providers.length === 0) return;
    const currentBlockReason = getCreateProviderBlockReason(
      providers.find((provider) => provider.id === createForm.provider) ?? null,
      createMode,
      providerHealthQuery.data ?? null,
      providerConfigs.find((config) => config.id === createForm.providerConfigId) ?? null,
      t,
    );
    if (!currentBlockReason) return;
    const replacement = findCreateProviderReplacement({
      providers,
      providerConfigs,
      currentProvider: createForm.provider,
      mode: createMode,
      health: providerHealthQuery.data ?? null,
    });
    if (replacement && replacement.id !== createForm.provider) {
      setCreateForm((current) => ({
        ...current,
        provider: replacement.id,
        providerConfigId: getDefaultProviderConfigId(providerConfigs, replacement.id),
      }));
    }
  }, [createForm.provider, createMode, createOpen, providerConfigs, providerHealthQuery.data, providers]);

  useEffect(() => {
    if (!createOpen) return;
    const current = providerConfigs.find((config) => config.id === createForm.providerConfigId);
    if (current?.provider === createForm.provider) return;
    const nextProviderConfigId = getDefaultProviderConfigId(providerConfigs, createForm.provider);
    if (nextProviderConfigId === createForm.providerConfigId) return;
    setCreateForm((form) => ({
      ...form,
      providerConfigId: nextProviderConfigId,
    }));
  }, [createForm.provider, createForm.providerConfigId, createOpen, providerConfigs]);

  useEffect(() => {
    if (!rotateOpen || !selectedSecret) return;
    setRotateProviderConfigId(
      selectedSecret.providerConfigId ?? getDefaultProviderConfigId(providerConfigs, selectedSecret.provider),
    );
  }, [providerConfigs, rotateOpen, selectedSecret]);

  function openCreateVault(provider: SecretProvider = "local_encrypted") {
    setEditingVault(null);
    setVaultForm(emptyProviderVaultForm(provider));
    setVaultError(null);
    setVaultDiscovery(null);
    setVaultDiscoveryError(null);
    setVaultDialogOpen(true);
  }

  function openEditVault(config: CompanySecretProviderConfig) {
    setEditingVault(config);
    setVaultForm(providerVaultFormFromConfig(config));
    setVaultError(null);
    setVaultDiscovery(null);
    setVaultDiscoveryError(null);
    setVaultDialogOpen(true);
  }

  function openImportFromVault(config?: CompanySecretProviderConfig | null) {
    setImportInitialVaultId(config?.id ?? null);
    setImportOpen(true);
  }

  function applyVaultDiscoveryCandidate(candidate: SecretProviderConfigDiscoveryCandidate) {
    if (candidate.provider !== "aws_secrets_manager") return;
    const config = candidate.config as Record<string, unknown>;
    setVaultForm((current) => ({
      ...current,
      displayName: current.displayName.trim() ? current.displayName : candidate.displayName,
      region: providerConfigValue(config, "region"),
      namespace: providerConfigValue(config, "namespace"),
      secretNamePrefix: providerConfigValue(config, "secretNamePrefix"),
      kmsKeyId: providerConfigValue(config, "kmsKeyId"),
      ownerTag: providerConfigValue(config, "ownerTag"),
      environmentTag: providerConfigValue(config, "environmentTag"),
    }));
  }

  function openCompanySecret(secret: CompanySecret) {
    setSecretDetailTab("details");
    setSelectedSecretId(secret.id);
    setSelectedDefinitionId(null);
  }

  function openUserDefinition(definition: UserSecretDefinition) {
    setSecretDetailTab("details");
    setSelectedDefinitionId(definition.id);
    setSelectedSecretId(null);
  }

  function openRotateSecret(secret: CompanySecret) {
    openCompanySecret(secret);
    setRotateOpen(true);
    setRotateValue("");
    setRotateExternalRef("");
    setRotateProviderConfigId(
      secret.providerConfigId ?? getDefaultProviderConfigId(providerConfigs, secret.provider),
    );
    setRotateError(null);
  }

  function copySecretKey(key: string) {
    void copyTextToClipboard(key)
      .then(() => pushToast({
        title: t("secrets.toast.keyCopied", { defaultValue: "Secret key copied" }),
        body: key,
        tone: "success",
      }))
      .catch((error) =>
        pushToast({
          title: t("secrets.toast.copyFailed", { defaultValue: "Copy failed" }),
          body: error instanceof Error
            ? error.message
            : t("secrets.toast.copyKeyFailed", { defaultValue: "Unable to copy secret key" }),
          tone: "error",
        }),
      );
  }

  function renderRowActions(row: UnifiedSecretRow) {
    const name = row.kind === "company" ? row.secret.name : row.definition.name;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("secrets.actionsFor", { name, defaultValue: "Actions for {{name}}" })}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onSelect={() => {
              if (row.kind === "company") openCompanySecret(row.secret);
              else openUserDefinition(row.definition);
            }}
          >
            <KeyRound className="h-4 w-4" />
            {t("common.viewDetails", { defaultValue: "View details" })}
          </DropdownMenuItem>
          {row.kind === "company" ? (
            <>
              <DropdownMenuItem onSelect={() => setUsageDialogSecretId(row.secret.id)}>
                <Link2 className="h-4 w-4" />
                {t("secrets.viewReferencesCount", {
                  count: row.secret.referenceCount ?? 0,
                  defaultValue: "View references ({{count}})",
                })}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openRotateSecret(row.secret)}>
                <RefreshCw className="h-4 w-4" />
                {row.secret.managedMode === "external_reference"
                  ? t("secrets.updateReference", { defaultValue: "Update reference" })
                  : t("secrets.updateValue", { defaultValue: "Update value" })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={statusMutation.isPending}
                onSelect={() =>
                  statusMutation.mutate({
                    id: row.secret.id,
                    status: row.secret.status === "active" ? "disabled" : "active",
                  })
                }
              >
                {row.secret.status === "active" ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {row.secret.status === "active"
                  ? t("common.disable", { defaultValue: "Disable" })
                  : t("common.activate", { defaultValue: "Activate" })}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={statusMutation.isPending}
                onSelect={() =>
                  statusMutation.mutate({
                    id: row.secret.id,
                    status: row.secret.status === "archived" ? "active" : "archived",
                  })
                }
              >
                {row.secret.status === "archived" ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {row.secret.status === "archived"
                  ? t("common.unarchive", { defaultValue: "Unarchive" })
                  : t("common.archive", { defaultValue: "Archive" })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteConfirm(row.secret)}>
                <Trash2 className="h-4 w-4" />
                {t("secrets.deleteSecret", { defaultValue: "Delete secret" })}
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem
                disabled={row.definition.status !== "active"}
                onSelect={() =>
                  setSetMyValueFor(
                    myUserSecrets.find((entry) => entry.definition.id === row.definition.id) ?? {
                      definition: row.definition,
                      secret: null,
                    },
                  )
                }
              >
                <KeyRound className="h-4 w-4" />
                {myUserSecrets.find((entry) => entry.definition.id === row.definition.id)?.secret
                  ? t("secrets.updateMyValue", { defaultValue: "Update my value" })
                  : t("secrets.setMyValue", { defaultValue: "Set my value" })}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openEditDefinition(row.definition)}>
                <Pencil className="h-4 w-4" />
                {t("secrets.editDefinition", { defaultValue: "Edit definition" })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={definitionStatusMutation.isPending}
                onSelect={() =>
                  definitionStatusMutation.mutate({
                    definition: row.definition,
                    status: row.definition.status === "active" ? "disabled" : "active",
                  })
                }
              >
                {row.definition.status === "active" ? (
                  <Ban className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {row.definition.status === "active"
                  ? t("common.disable", { defaultValue: "Disable" })
                  : t("common.activate", { defaultValue: "Activate" })}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={definitionStatusMutation.isPending}
                onSelect={() =>
                  definitionStatusMutation.mutate({
                    definition: row.definition,
                    status: row.definition.status === "archived" ? "active" : "archived",
                  })
                }
              >
                {row.definition.status === "archived" ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {row.definition.status === "archived"
                  ? t("common.unarchive", { defaultValue: "Unarchive" })
                  : t("common.archive", { defaultValue: "Archive" })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDefinitionDeleteConfirm(row.definition)}>
                <Trash2 className="h-4 w-4" />
                {t("secrets.deleteDefinition", { defaultValue: "Delete definition" })}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("secrets.selectCompany", { defaultValue: "Select a company to manage secrets." })}
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t("Secrets", { defaultValue: "Secrets" })}</h1>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SecretsTab)}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <PageTabBar
          items={[
            { value: "secrets", label: t("Secrets", { defaultValue: "Secrets" }) },
            { value: "my-secrets", label: t("secrets.mySecrets", { defaultValue: "My secrets" }) },
            { value: "vaults", label: t("secrets.providerVaults", { defaultValue: "Provider vaults" }) },
          ]}
          align="start"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SecretsTab)}
        />

        <TabsContent value="secrets" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <SecretsHowToUse />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48 sm:w-64 md:w-80">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("secrets.searchPlaceholder", { defaultValue: "Search by name, key, ref" })}
                className="pl-7 text-xs sm:text-sm"
                aria-label={t("secrets.searchAria", { defaultValue: "Search secrets" })}
                data-page-search-target="true"
              />
            </div>
            <SecretsFiltersPopover
              statusFilter={statusFilter}
              providerFilter={providerFilter}
              providedByFilter={providedByFilter}
              providers={providers}
              activeFilterCount={activeSecretFilterCount}
              onStatusChange={setStatusFilter}
              onProviderChange={setProviderFilter}
              onProvidedByChange={setProvidedByFilter}
            />
            <ImportFromVaultButton
              providerConfigs={providerConfigs}
              onClick={() => openImportFromVault()}
              onManageVaults={() => setActiveTab("vaults")}
              className="ml-auto"
            />
            <Button onClick={openCreateSecret} size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> {t("secrets.newSecret", { defaultValue: "New secret" })}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {secretsQuery.isError || userDefinitionsQuery.isError ? (
              <div className="text-sm text-destructive flex items-center gap-2 py-4">
                <AlertCircle className="h-4 w-4" /> {t("secrets.failedToLoad", { defaultValue: "Failed to load secrets:" })}{" "}
                {((secretsQuery.error ?? userDefinitionsQuery.error) as Error).message}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void secretsQuery.refetch();
                    void userDefinitionsQuery.refetch();
                  }}
                >
                  {t("common.retry", { defaultValue: "Retry" })}
                </Button>
              </div>
            ) : unifiedRows.length === 0 && !secretsQuery.isPending && !userDefinitionsQuery.isPending ? (
              <EmptyState
                icon={KeyRound}
                message={t("secrets.empty", { defaultValue: "No secrets yet. Create a shared company secret or one that each user supplies." })}
                action={t("secrets.newSecret", { defaultValue: "New secret" })}
                onAction={openCreateSecret}
              />
            ) : filteredRows.length === 0 ? (
              <EmptyState icon={Search} message={t("secrets.noFilterMatches", { defaultValue: "No secrets match your filters." })} />
            ) : (
              <div className="@container min-w-0 overflow-x-hidden text-sm" data-testid="secrets-list-container">
                <div
                  role="table"
                  aria-label={t("Secrets", { defaultValue: "Secrets" })}
                  className="hidden min-w-0 @min-[40rem]:block"
                  data-testid="secrets-table-view"
                >
                  <div
                    role="row"
                    className="grid grid-cols-(--gtc-54) items-center gap-3 bg-muted/40 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    <div role="columnheader" className="font-medium">{t("secrets.secret", { defaultValue: "Secret" })}</div>
                    <div role="columnheader" className="font-medium">{t("common.status", { defaultValue: "Status" })}</div>
                    <div role="columnheader" className="font-medium">{t("secrets.versionCoverage", { defaultValue: "Version / coverage" })}</div>
                    <div role="columnheader" className="font-medium">{t("common.updated", { defaultValue: "Updated" })}</div>
                    <div role="columnheader" className="sr-only">{t("common.actions", { defaultValue: "Actions" })}</div>
                  </div>
                  <div role="rowgroup">
                    {filteredRows.map((row) => {
                      const status = row.kind === "company" ? row.secret.status : row.definition.status;
                      const updatedAt = row.kind === "company" ? row.secret.updatedAt : row.definition.updatedAt;
                      const updatedTooltip =
                        row.kind === "company"
                          ? [
                              t("secrets.updatedAt", {
                                date: formatRelative(row.secret.updatedAt, t),
                                defaultValue: "Updated: {{date}}",
                              }),
                              t("secrets.lastRotatedAt", {
                                date: formatRelative(row.secret.lastRotatedAt, t),
                                defaultValue: "Last rotated: {{date}}",
                              }),
                              t("secrets.lastResolvedAt", {
                                date: formatRelative(row.secret.lastResolvedAt, t),
                                defaultValue: "Last resolved: {{date}}",
                              }),
                            ].join("\n")
                          : [
                              t("secrets.updatedAt", {
                                date: formatRelative(row.definition.updatedAt, t),
                                defaultValue: "Updated: {{date}}",
                              }),
                              t("secrets.userValuesResolvePerMember", {
                                defaultValue: "Last resolved: user values resolve per member",
                              }),
                            ].join("\n");
                      return (
                        <div
                          key={row.id}
                          role="row"
                          className={cn(
                            "grid cursor-pointer grid-cols-(--gtc-54) items-center gap-3 border-b border-border/60 px-3 py-3 hover:bg-accent/40",
                            row.kind === "company" && selectedSecretId === row.secret.id && "bg-accent/60",
                            row.kind === "user" && selectedDefinitionId === row.definition.id && "bg-accent/60",
                          )}
                          onClick={() => {
                            if (row.kind === "company") openCompanySecret(row.secret);
                            else openUserDefinition(row.definition);
                          }}
                        >
                          <div role="cell" className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-medium text-foreground">
                                {row.kind === "company" ? row.secret.name : row.definition.name}
                              </span>
                              {row.kind === "company" ? (
                                <SecretProviderIndicator
                                  secret={row.secret}
                                  providers={providers}
                                  providerConfigs={providerConfigs}
                                />
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      aria-label={t("secrets.eachUserOwnsValue", {
                                        defaultValue: "Each user provides and owns their own value",
                                      })}
                                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-200"
                                    >
                                      <UserRound className="h-3 w-3" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("secrets.eachUserOwnsValue", {
                                      defaultValue: "Each user provides and owns their own value",
                                    })}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <code className="mt-0.5 block truncate text-(length:--text-micro) text-muted-foreground">
                              {row.kind === "company" ? row.secret.key : row.definition.key}
                            </code>
                            <div className="mt-1">
                              {row.kind === "company" ? (
                                <MetaChip>
                                  <ShieldCheck className="h-3 w-3" /> {t("secrets.valueProvider.company", { defaultValue: "Company" })}
                                </MetaChip>
                              ) : (
                                <UserSecretChip label={t("secrets.valueProvider.eachUser", { defaultValue: "Each user" })} />
                              )}
                            </div>
                          </div>
                          <div role="cell">
                            <StatusBadge status={status} />
                          </div>
                          <div role="cell" className="min-w-0 text-xs">
                            {row.kind === "company" ? (
                              <span className="truncate text-muted-foreground">
                                <span className="font-mono text-foreground">v{row.secret.latestVersion}</span>
                                <span> · {modeLabel(row.secret.managedMode, t)}</span>
                              </span>
                            ) : (
                              <CoverageInline companyId={selectedCompanyId} definitionId={row.definition.id} compact />
                            )}
                          </div>
                          <div role="cell">
                            <UpdatedWithTooltip updatedAt={updatedAt} tooltip={updatedTooltip} />
                          </div>
                          <div role="cell" className="text-right" onClick={(event) => event.stopPropagation()}>
                            {renderRowActions(row)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 @min-[40rem]:hidden" data-testid="secrets-card-view">
                  {filteredRows.map((row) => {
                    const status = row.kind === "company" ? row.secret.status : row.definition.status;
                    return (
                      <div
                        key={row.id}
                        className={cn(
                          "cursor-pointer rounded-md border border-border bg-background p-3 hover:bg-accent/30",
                          row.kind === "company" && selectedSecretId === row.secret.id && "bg-accent/60",
                          row.kind === "user" && selectedDefinitionId === row.definition.id && "bg-accent/60",
                        )}
                        onClick={() => {
                          if (row.kind === "company") openCompanySecret(row.secret);
                          else openUserDefinition(row.definition);
                        }}
                      >
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {row.kind === "company" ? row.secret.name : row.definition.name}
                            </div>
                            <code className="mt-0.5 block truncate text-(length:--text-micro) text-muted-foreground">
                              {row.kind === "company" ? row.secret.key : row.definition.key}
                            </code>
                          </div>
                          <div onClick={(event) => event.stopPropagation()}>{renderRowActions(row)}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {row.kind === "company" ? (
                            <>
                              <MetaChip>
                                <ShieldCheck className="h-3 w-3" /> {t("secrets.valueProvider.company", { defaultValue: "Company" })}
                              </MetaChip>
                              <SecretProviderIndicator
                                secret={row.secret}
                                providers={providers}
                                providerConfigs={providerConfigs}
                              />
                              <StatusBadge status={status} />
                            </>
                          ) : (
                            <>
                              <UserSecretChip label={t("secrets.valueProvider.eachUser", { defaultValue: "Each user" })} />
                              <StatusBadge status={status} />
                              <CoverageInline companyId={selectedCompanyId} definitionId={row.definition.id} compact />
                            </>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="min-w-0 truncate">
                            {row.kind === "company" ? (
                              <>
                                v{row.secret.latestVersion} ·{" "}
                                {modeLabel(row.secret.managedMode, t)}
                              </>
                            ) : (
                              t("secrets.memberOwnedValues", { defaultValue: "Member-owned values" })
                            )}
                          </span>
                          <span>
                            {t("secrets.updatedShort", {
                              date: formatRelative(row.kind === "company" ? row.secret.updatedAt : row.definition.updatedAt, t),
                              defaultValue: "Updated {{date}}",
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent
          value="my-secrets"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
        >
          <MyUserSecretsTab companyId={selectedCompanyId} />
        </TabsContent>
        <TabsContent value="vaults" className="min-h-0 flex-1 overflow-y-auto">
          <ProviderVaultsTab
            providers={providers}
            providerConfigs={providerConfigs}
            loading={providerConfigsQuery.isPending}
            error={providerConfigsQuery.error}
            onRetry={() => providerConfigsQuery.refetch()}
            onCreate={openCreateVault}
            onEdit={openEditVault}
            onDisable={(config) => disableVaultMutation.mutate(config.id)}
            onRemove={(config) => setRemoveVaultConfirm(config)}
            onSetDefault={(config) => defaultVaultMutation.mutate(config.id)}
            onHealthCheck={(config) => healthVaultMutation.mutate(config.id)}
            onImportSecrets={openImportFromVault}
            pendingActionId={
              disableVaultMutation.variables ??
              removeVaultMutation.variables ??
              defaultVaultMutation.variables ??
              healthVaultMutation.variables ??
              null
            }
          />
        </TabsContent>
      </Tabs>

      <Sheet
        open={Boolean(selectedSecret || selectedDefinition)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSecretId(null);
            setSelectedDefinitionId(null);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0">
          {selectedSecret ? (
            <>
              <SheetHeader className="space-y-3">
                <SheetTitle className="flex min-w-0 items-center gap-2 pr-8 text-base">
                  <KeyRound className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{selectedSecret.name}</span>
                  <span className="shrink-0">
                    <StatusBadge status={selectedSecret.status} />
                  </span>
                </SheetTitle>
                <SheetDescription className="sr-only">
                  {providerLabel(providers, selectedSecret.provider, t)} {t("secrets.secret", { defaultValue: "secret" })} {selectedSecret.key}
                </SheetDescription>
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {selectedSecret.key}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => copySecretKey(selectedSecret.key)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> {t("common.copy", { defaultValue: "Copy" })}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <MetaChip>
                    <ShieldCheck className="h-3 w-3" /> {t("secrets.valueProvider.company", { defaultValue: "Company" })}
                  </MetaChip>
                  <MetaChip>{modeLabel(selectedSecret.managedMode, t)}</MetaChip>
                  <MetaChip>{providerLabel(providers, selectedSecret.provider, t)}</MetaChip>
                  <MetaChip>v{selectedSecret.latestVersion}</MetaChip>
                </div>
              </SheetHeader>
              <div className="flex items-center gap-2 px-4 pb-2">
                <Button
                  size="sm"
                  onClick={() => openRotateSecret(selectedSecret)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {selectedSecret.managedMode === "external_reference"
                    ? t("secrets.updateReference", { defaultValue: "Update reference" })
                    : t("secrets.updateValue", { defaultValue: "Update value" })}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t("secrets.moreActionsFor", {
                        name: selectedSecret.name,
                        defaultValue: "More actions for {{name}}",
                      })}
                    >
                      <MoreHorizontal className="mr-1 h-3.5 w-3.5" /> {t("common.more", { defaultValue: "More" })}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      disabled={statusMutation.isPending}
                      onSelect={() =>
                        statusMutation.mutate({
                          id: selectedSecret.id,
                          status: selectedSecret.status === "active" ? "disabled" : "active",
                        })
                      }
                    >
                      {selectedSecret.status === "active" ? (
                        <Ban className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {selectedSecret.status === "active"
                        ? t("common.disable", { defaultValue: "Disable" })
                        : t("common.activate", { defaultValue: "Activate" })}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={statusMutation.isPending}
                      onSelect={() =>
                        statusMutation.mutate({
                          id: selectedSecret.id,
                          status: selectedSecret.status === "archived" ? "active" : "archived",
                        })
                      }
                    >
                      {selectedSecret.status === "archived" ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                      {selectedSecret.status === "archived"
                        ? t("common.unarchive", { defaultValue: "Unarchive" })
                        : t("common.archive", { defaultValue: "Archive" })}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteConfirm(selectedSecret)}>
                      <Trash2 className="h-4 w-4" /> {t("secrets.deleteSecret", { defaultValue: "Delete secret" })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Tabs value={secretDetailTab} onValueChange={setSecretDetailTab} className="flex-1 min-h-0 flex flex-col">
                <div className="border-b border-border px-4">
                  <PageTabBar
                    items={[
                      { value: "details", label: t("secrets.details", { defaultValue: "Details" }) },
                      {
                        value: "usage",
                        label: usageQuery.data
                          ? t("secrets.usageWithCount", {
                              count: usageQuery.data.bindings.length,
                              defaultValue: "Usage ({{count}})",
                            })
                          : t("secrets.usage", { defaultValue: "Usage" }),
                      },
                      { value: "events", label: t("secrets.accessEvents", { defaultValue: "Access events" }) },
                    ]}
                    align="start"
                    value={secretDetailTab}
                    onValueChange={setSecretDetailTab}
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                  <TabsContent value="details">
                    <SecretDetailsTab
                      secret={selectedSecret}
                      providers={providers}
                      providerConfigs={providerConfigs}
                      onViewUsage={() => setSecretDetailTab("usage")}
                    />
                  </TabsContent>
                  <TabsContent value="usage">
                    <SecretUsageTab loading={usageQuery.isPending} bindings={usageQuery.data?.bindings ?? []} />
                  </TabsContent>
                  <TabsContent value="events">
                    <SecretEventsTab
                      loading={eventsQuery.isPending}
                      events={eventsQuery.data ?? []}
                      companyId={selectedCompanyId}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            </>
          ) : selectedDefinition ? (
            <>
              <SheetHeader className="space-y-3">
                <SheetTitle className="flex min-w-0 items-center gap-2 pr-8 text-base">
                  <UserRound className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{selectedDefinition.name}</span>
                  <span className="shrink-0">
                    <StatusBadge status={selectedDefinition.status} />
                  </span>
                </SheetTitle>
                <SheetDescription className="sr-only">
                  {t("secrets.userDefinitionDescription", {
                    key: selectedDefinition.key,
                    defaultValue: "Each-user secret definition {{key}}",
                  })}
                </SheetDescription>
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {selectedDefinition.key}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => copySecretKey(selectedDefinition.key)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    {t("common.copy", { defaultValue: "Copy" })}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <UserSecretChip
                    label={t("secrets.valueProvider.eachUser", { defaultValue: "Each user" })}
                  />
                  <MetaChip>
                    <CoverageInline companyId={selectedCompanyId} definitionId={selectedDefinition.id} compact />
                  </MetaChip>
                </div>
              </SheetHeader>
              <div className="flex items-center gap-2 px-4 pb-2">
                <Button
                  size="sm"
                  onClick={() =>
                    setSetMyValueFor(
                      selectedDefinitionMyEntry ?? { definition: selectedDefinition, secret: null },
                    )
                  }
                  disabled={selectedDefinition.status !== "active"}
                >
                  <KeyRound className="h-3.5 w-3.5 mr-1" />
                  {selectedDefinitionMyEntry?.secret
                    ? t("secrets.updateMyValue", { defaultValue: "Update my value" })
                    : t("secrets.setMyValue", { defaultValue: "Set my value" })}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t("secrets.moreActionsFor", {
                        name: selectedDefinition.name,
                        defaultValue: "More actions for {{name}}",
                      })}
                    >
                      <MoreHorizontal className="mr-1 h-3.5 w-3.5" />
                      {t("common.more", { defaultValue: "More" })}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => openEditDefinition(selectedDefinition)}>
                      <Pencil className="h-4 w-4" />
                      {t("secrets.editDefinition", { defaultValue: "Edit definition" })}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={definitionStatusMutation.isPending}
                      onSelect={() =>
                        definitionStatusMutation.mutate({
                          definition: selectedDefinition,
                          status: selectedDefinition.status === "active" ? "disabled" : "active",
                        })
                      }
                    >
                      {selectedDefinition.status === "active" ? (
                        <Ban className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {selectedDefinition.status === "active"
                        ? t("common.disable", { defaultValue: "Disable" })
                        : t("common.activate", { defaultValue: "Activate" })}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={definitionStatusMutation.isPending}
                      onSelect={() =>
                        definitionStatusMutation.mutate({
                          definition: selectedDefinition,
                          status: selectedDefinition.status === "archived" ? "active" : "archived",
                        })
                      }
                    >
                      {selectedDefinition.status === "archived" ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                      {selectedDefinition.status === "archived"
                        ? t("common.unarchive", { defaultValue: "Unarchive" })
                        : t("common.archive", { defaultValue: "Archive" })}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDefinitionDeleteConfirm(selectedDefinition)}>
                      <Trash2 className="h-4 w-4" />
                      {t("secrets.deleteDefinition", { defaultValue: "Delete definition" })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Tabs value={secretDetailTab} onValueChange={setSecretDetailTab} className="flex-1 min-h-0 flex flex-col">
                <div className="border-b border-border px-4">
                  <PageTabBar
                    items={[
                      { value: "details", label: t("secrets.details", { defaultValue: "Details" }) },
                      { value: "coverage", label: t("secrets.coverage", { defaultValue: "Coverage" }) },
                      { value: "usage", label: t("secrets.usage", { defaultValue: "Usage" }) },
                      { value: "events", label: t("secrets.accessEvents", { defaultValue: "Access events" }) },
                    ]}
                    align="start"
                    value={secretDetailTab}
                    onValueChange={setSecretDetailTab}
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                  <TabsContent value="details">
                    <UserSecretDetailsTab
                      companyId={selectedCompanyId}
                      definition={selectedDefinition}
                      onViewCoverage={() => setSecretDetailTab("coverage")}
                    />
                  </TabsContent>
                  <TabsContent value="coverage">
                    <UserSecretCoverageTab
                      companyId={selectedCompanyId}
                      definitionId={selectedDefinition.id}
                    />
                  </TabsContent>
                  <TabsContent value="usage">
                    <UserSecretUsageTab definition={selectedDefinition} />
                  </TabsContent>
                  <TabsContent value="events">
                    <UserSecretAccessEventsTab />
                  </TabsContent>
                </div>
              </Tabs>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(usageDialogSecret)}
        onOpenChange={(open) => !open && setUsageDialogSecretId(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("secrets.secretReferences", { defaultValue: "Secret references" })}</DialogTitle>
            <DialogDescription>
              {usageDialogSecret
                ? t("secrets.referenceCountDescription", {
                    name: usageDialogSecret.name,
                    count: usageDialogSecret.referenceCount ?? 0,
                    defaultValue: "{{name}} is referenced by {{count}} place(s).",
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          <SecretUsageTab
            loading={usageDialogQuery.isPending}
            bindings={usageDialogQuery.data?.bindings ?? []}
          />
        </DialogContent>
      </Dialog>

      {selectedCompanyId && (
        <ImportFromVaultDialog
          open={importOpen}
          onOpenChange={(open) => {
            setImportOpen(open);
            if (!open) setImportInitialVaultId(null);
          }}
          companyId={selectedCompanyId}
          providerConfigs={providerConfigs}
          existingSecrets={secrets}
          initialProviderConfigId={importInitialVaultId}
          onManageVaults={() => {
            setImportOpen(false);
            setImportInitialVaultId(null);
            setActiveTab("vaults");
          }}
          onImportComplete={() => {
            void secretsQuery.refetch();
          }}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-(--sz-calc-18) overflow-y-auto p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {editingDefinition
                ? t("secrets.editUserProvidedSecret", { defaultValue: "Edit user-provided secret" })
                : t("secrets.createSecret", { defaultValue: "Create secret" })}
            </DialogTitle>
            <DialogDescription>
              {t("secrets.createDescription", { defaultValue: "Choose who provides the value. Shared fields keep their values when you switch modes." })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium" htmlFor="new-secret-name">{t("common.name", { defaultValue: "Name" })}</label>
                <Input
                  id="new-secret-name"
                  value={createForm.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    setCreateForm((current) => ({
                      ...current,
                      name,
                      key: createKeyDirty
                        ? current.key
                        : secretValueProvider === "user"
                          ? normalizeUserSecretKeyForPreview(name)
                          : normalizeSecretKeyForPreview(name),
                    })); 
                  }}
                  placeholder={secretValueProvider === "user"
                    ? t("secrets.userSecretNamePlaceholder", { defaultValue: "Personal GitHub token" })
                    : "OPENAI_API_KEY"}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="new-secret-key">
                  {t("secrets.key", { defaultValue: "Key" })}{" "}
                  {secretValueProvider === "company" ? (
                    <span className="text-muted-foreground/70">{t("common.optionalParenthetical", { defaultValue: "(optional)" })}</span>
                  ) : null}
                </label>
                <Input
                  id="new-secret-key"
                  value={createForm.key}
                  onChange={(event) => {
                    setCreateKeyDirty(true);
                    setCreateForm((current) => ({ ...current, key: event.target.value }));
                  }}
                  placeholder={secretValueProvider === "user" ? "PERSONAL_GH_TOKEN" : t("secrets.autoFromName", { defaultValue: "auto from name" })}
                  disabled={Boolean(editingDefinition)}
                  className={secretValueProvider === "user" ? "font-mono text-sm" : undefined}
                />
                <p className="mt-1 text-(length:--text-micro) text-muted-foreground">
                  {secretValueProvider === "user"
                    ? editingDefinition
                      ? t("secrets.userSecretKeyStable", { defaultValue: "Stable env binding key. Cannot be changed." })
                      : t("secrets.userSecretKeyHelp", { defaultValue: "Env-style key used by user-secret bindings." })
                    : t("secrets.companySecretKeyHelp", { defaultValue: "Shared secret keys keep lowercase dash normalization." })}
                </p>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="new-secret-description">
                {t("common.description", { defaultValue: "Description" })}{" "}
                <span className="text-muted-foreground/70">{t("common.optionalParenthetical", { defaultValue: "(optional)" })}</span>
              </label>
              <Input
                id="new-secret-description"
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder={t("secrets.descriptionPlaceholder", { defaultValue: "What is this secret used for? (no values)" })}
              />
            </div>

            {!editingDefinition ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">{t("secrets.whoProvidesValue", { defaultValue: "Who provides the value?" })}</p>
                <Tabs
                  value={secretValueProvider}
                  onValueChange={(value) => {
                    const next = value as SecretValueProvider;
                    setSecretValueProvider(next);
                    setCreateForm((current) => ({
                      ...current,
                      key: createKeyDirty
                        ? current.key
                        : next === "user"
                          ? normalizeUserSecretKeyForPreview(current.name)
                          : normalizeSecretKeyForPreview(current.name),
                    }));
                  }}
                >
                  <TabsList className="grid h-auto w-full grid-cols-2">
                    <TabsTrigger value="company">{t("secrets.valueProvider.company", { defaultValue: "Company" })}</TabsTrigger>
                    <TabsTrigger value="user">{t("secrets.valueProvider.eachUser", { defaultValue: "Each user" })}</TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="text-(length:--text-micro) text-muted-foreground">
                  {t("secrets.valueProviderHelp", {
                    defaultValue: "Company stores one shared value. Each user lets every member supply their own value under My secrets.",
                  })}
                </p>
              </div>
            ) : null}

            {secretValueProvider === "company" ? (
              <>
                <Tabs value={createMode} onValueChange={(value) => setCreateMode(value as CreateMode)}>
                  <TabsList className="grid h-auto w-full grid-cols-2">
                    <TabsTrigger
                      value="managed"
                      className="min-h-9 whitespace-normal px-1.5 text-center text-xs leading-tight sm:text-sm"
                    >
                      {t("secrets.managedValue", { defaultValue: "Managed value" })}
                    </TabsTrigger>
                    <TabsTrigger
                      value="external"
                      className="min-h-9 whitespace-normal px-1.5 text-center text-xs leading-tight sm:text-sm"
                    >
                      {t("secrets.externalReference", { defaultValue: "External reference" })}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div>
                  <label className="text-xs font-medium" htmlFor="new-secret-provider">{t("secrets.provider", { defaultValue: "Provider" })}</label>
                  <select
                    id="new-secret-provider"
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none"
                    value={createForm.provider}
                    onChange={(event) =>
                      setCreateForm((current) => {
                        const provider = event.target.value as SecretProvider;
                        return {
                          ...current,
                          provider,
                          providerConfigId: getDefaultProviderConfigId(providerConfigs, provider),
                        };
                      })
                    }
                  >
                    {providers.map((provider) => (
                      <option
                        key={provider.id}
                        value={provider.id}
                        disabled={Boolean(
                          getCreateProviderBlockReason(
                            provider,
                            createMode,
                            providerHealthQuery.data ?? null,
                            getSelectableProviderConfig(providerConfigs, provider.id),
                            t,
                          ),
                        )}
                      >
                        {providerLabel(providers, provider.id, t)}
                        {provider.configured === false &&
                        !getSelectableProviderConfig(providerConfigs, provider.id)
                          ? ` ${t("secrets.deploymentDefaultMissingParenthetical", { defaultValue: "(deployment default missing)" })}`
                          : provider.requiresExternalRef
                            ? ` ${t("secrets.externalOnlyParenthetical", { defaultValue: "(external only)" })}`
                            : ""}
                      </option>
                    ))}
                  </select>
                  {createProviderBlockReason ? (
                    <p className="mt-1 flex items-center gap-1 text-(length:--text-micro) text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {createProviderBlockReason}
                    </p>
                  ) : createProviderHealthText ? (
                    <p className="mt-1 text-(length:--text-micro) text-muted-foreground">{createProviderHealthText}</p>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs font-medium" htmlFor="new-secret-vault">{t("secrets.providerVault", { defaultValue: "Provider vault" })}</label>
                  <select
                    id="new-secret-vault"
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none"
                    value={createForm.providerConfigId}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, providerConfigId: event.target.value }))
                    }
                  >
                    <option value="">{t("secrets.deploymentDefault", { defaultValue: "Deployment default" })}</option>
                    {createProviderConfigs.map((config) => {
                      const blockReason = getProviderConfigBlockReason(config, t);
                      return (
                        <option key={config.id} value={config.id} disabled={Boolean(blockReason)}>
                          {config.displayName}
                          {config.isDefault ? ` ${t("common.defaultParenthetical", { defaultValue: "(default)" })}` : ""}
                          {blockReason ? ` (${blockReason})` : ""}
                        </option>
                      );
                    })}
                  </select>
                  {selectedCreateProviderConfig ? (
                    <ProviderVaultInlineWarning config={selectedCreateProviderConfig} />
                  ) : (
                    <p className="mt-1 text-(length:--text-micro) text-muted-foreground">
                      {t("secrets.deploymentDefaultCompatibility", {
                        defaultValue: "Existing deployment-level provider settings stay available for backwards compatibility.",
                      })}
                    </p>
                  )}
                </div>
                {createMode === "managed" ? (
                  <>
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-(length:--text-micro) text-emerald-700 dark:text-emerald-300">
                  {t("secrets.paperclipManagedHelp", {
                    defaultValue: "Paperclip-managed secrets are created in the selected provider and future rotations write a new provider version through Paperclip.",
                  })}
                  {awsManagedPathPreview ? (
                    <div className="mt-1">
                      {t("secrets.awsManagedPath", { defaultValue: "AWS managed path:" })}{" "}
                      <code className="break-all rounded bg-background/70 px-1 py-0.5">
                        {awsManagedPathPreview}
                      </code>
                    </div>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs font-medium" htmlFor="new-secret-value">{t("secrets.value", { defaultValue: "Value" })}</label>
                  <Textarea
                    id="new-secret-value"
                    value={createForm.value}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, value: event.target.value }))
                    }
                    rows={3}
                    className="min-w-0 overflow-x-hidden break-all font-mono text-xs"
                    placeholder={t("secrets.valuePlaceholder", { defaultValue: "Stored once, never re-displayed" })}
                  />
                </div>
                  </>
                ) : (
                  <div>
                    <label className="text-xs font-medium" htmlFor="new-secret-ref">{t("secrets.externalReference", { defaultValue: "External reference" })}</label>
                    <Input
                      id="new-secret-ref"
                      value={createForm.externalRef}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, externalRef: event.target.value }))
                      }
                      placeholder="arn:aws:secretsmanager:..."
                      className="font-mono text-xs"
                    />
                    <p className="text-(length:--text-micro) text-muted-foreground mt-1">
                      {t("secrets.externalReferenceHelp", {
                        defaultValue: "Existing provider secrets are resolve-only in Paperclip. Rotate the value in the provider, then update this reference only if the path, ARN, or version changes.",
                      })}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-2 text-(length:--text-micro) text-violet-800 dark:text-violet-200">
                  {t("secrets.userProvidedSecretHelp", {
                    defaultValue: "Every member supplies their own value under My secrets. Agents resolve the responsible user's value at runtime.",
                  })}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground" htmlFor="new-secret-usage-guidance">
                    {t("secrets.usageGuidance", { defaultValue: "Usage guidance" })}{" "}
                    <span className="text-muted-foreground/70">{t("common.optionalParenthetical", { defaultValue: "(optional)" })}</span>
                  </label>
                  <Textarea
                    id="new-secret-usage-guidance"
                    value={createForm.usageGuidance}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, usageGuidance: event.target.value }))
                    }
                    placeholder={t("secrets.usageGuidancePlaceholder", { defaultValue: "Tell members how to create their token, required scopes, etc." })}
                    className="min-h-(--sz-70px) text-sm"
                  />
                </div>
              </>
            )}
            {createError ? (
              <SecretCreateError
                error={createError}
                provider={createForm.provider}
                providerConfigId={createForm.providerConfigId || null}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={() => {
                setCreateError(null);
                createMutation.mutate();
              }}
              disabled={
                createMutation.isPending ||
                !createForm.name.trim() ||
                (secretValueProvider === "user"
                  ? !createForm.key.trim()
                  : Boolean(createProviderBlockReason) ||
                    (createMode === "managed" ? !createForm.value : !createForm.externalRef.trim()))
              }
            >
              {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {editingDefinition
                ? t("common.saveChanges", { defaultValue: "Save changes" })
                : secretValueProvider === "user"
                  ? t("secrets.createUserProvidedSecret", { defaultValue: "Create user-provided secret" })
                  : createMode === "managed"
                    ? t("secrets.createSecret", { defaultValue: "Create secret" })
                    : t("secrets.linkReference", { defaultValue: "Link reference" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vaultDialogOpen} onOpenChange={setVaultDialogOpen}>
        <DialogContent className="max-h-(--sz-85vh) overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingVault
                ? t("secrets.editProviderVault", { defaultValue: "Edit provider vault" })
                : t("secrets.createProviderVault", { defaultValue: "Create provider vault" })}
            </DialogTitle>
            <DialogDescription>
              {t("secrets.providerVaultDialogDescription", {
                defaultValue: "Save only non-sensitive routing metadata. Credentials stay in the runtime environment or provider identity.",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium" htmlFor="vault-provider">{t("secrets.provider", { defaultValue: "Provider" })}</label>
                <select
                  id="vault-provider"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none disabled:opacity-60"
                  value={vaultForm.provider}
                  disabled={Boolean(editingVault)}
                  onChange={(event) => {
                    const provider = event.target.value as SecretProvider;
                    setVaultForm(emptyProviderVaultForm(provider));
                    setVaultDiscovery(null);
                    setVaultDiscoveryError(null);
                  }}
                >
                  {PROVIDER_ORDER.map((provider) => (
                    <option key={provider} value={provider}>
                      {providerLabel(providers, provider, t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="vault-name">{t("secrets.displayName", { defaultValue: "Display name" })}</label>
                <Input
                  id="vault-name"
                  value={vaultForm.displayName}
                  onChange={(event) =>
                    setVaultForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                  placeholder={t("secrets.displayNamePlaceholder", { defaultValue: "Production local vault" })}
                />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="vault-status">{t("common.status", { defaultValue: "Status" })}</label>
                <select
                  id="vault-status"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none"
                  value={vaultForm.status}
                  onChange={(event) => {
                    const status = event.target.value as SecretProviderConfigStatus;
                    setVaultForm((current) => ({
                      ...current,
                      status,
                      isDefault:
                        status === "coming_soon" || status === "disabled" ? false : current.isDefault,
                    }));
                  }}
                >
                  <option value="ready" disabled={vaultForm.provider === "gcp_secret_manager" || vaultForm.provider === "vault"}>
                    {t("status.ready", { defaultValue: "Ready" })}
                  </option>
                  <option value="warning" disabled={vaultForm.provider === "gcp_secret_manager" || vaultForm.provider === "vault"}>
                    {t("status.warning", { defaultValue: "Warning" })}
                  </option>
                  <option value="coming_soon">{t("status.comingSoon", { defaultValue: "Coming soon" })}</option>
                  <option value="disabled">{t("status.disabled", { defaultValue: "Disabled" })}</option>
                </select>
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={vaultForm.isDefault}
                  disabled={vaultForm.status === "coming_soon" || vaultForm.status === "disabled"}
                  onChange={(event) =>
                    setVaultForm((current) => ({ ...current, isDefault: event.target.checked }))
                  }
                />
                {t("secrets.defaultForProvider", {
                  provider: providerLabel(providers, vaultForm.provider, t),
                  defaultValue: "Default for {{provider}}",
                })}
              </label>
            </div>

            <ProviderVaultFields form={vaultForm} onChange={setVaultForm} />

            {!editingVault && vaultForm.provider === "aws_secrets_manager" ? (
              <AwsProviderVaultDiscoveryPanel
                form={vaultForm}
                preview={vaultDiscovery}
                error={vaultDiscoveryError}
                loading={discoverVaultMutation.isPending}
                onDiscover={() => {
                  setVaultDiscovery(null);
                  setVaultDiscoveryError(null);
                  discoverVaultMutation.mutate();
                }}
                onApply={applyVaultDiscoveryCandidate}
              />
            ) : null}

            {vaultForm.provider === "gcp_secret_manager" || vaultForm.provider === "vault" ? (
              <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-700 dark:text-sky-300">
                {t("secrets.providerComingSoonHelp", {
                  defaultValue: "This provider can save draft routing metadata, but runtime writes and resolution stay disabled until the provider module is implemented and reviewed.",
                })}
              </div>
            ) : null}
            {vaultError ? <p className="text-xs text-destructive">{vaultError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVaultDialogOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={() => {
                setVaultError(null);
                saveVaultMutation.mutate();
              }}
              disabled={
                saveVaultMutation.isPending ||
                !vaultForm.displayName.trim() ||
                (vaultForm.provider === "aws_secrets_manager" && !vaultForm.region.trim())
              }
            >
              {saveVaultMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {editingVault
                ? t("secrets.saveVault", { defaultValue: "Save vault" })
                : t("secrets.createVault", { defaultValue: "Create vault" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedSecret?.managedMode === "external_reference"
                ? t("secrets.updateExternalReference", { defaultValue: "Update external reference" })
                : t("secrets.updateSecretValue", { defaultValue: "Update secret value" })}
            </DialogTitle>
            <DialogDescription>
              {selectedSecret?.managedMode === "external_reference"
                ? t("secrets.updateExternalReferenceDescription", {
                    defaultValue: "Creates a new Paperclip metadata version that points at an existing provider secret. Paperclip does not write a new provider value.",
                  })
                : t("secrets.updateSecretValueDescription", {
                    defaultValue: "Creates a new provider-backed version. Consumers pinned to latest pick up the new value on the next run.",
                  })}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-medium" htmlFor="rotate-secret-vault">{t("secrets.providerVault", { defaultValue: "Provider vault" })}</label>
            <select
              id="rotate-secret-vault"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none"
              value={rotateProviderConfigId}
              onChange={(event) => setRotateProviderConfigId(event.target.value)}
            >
              <option value="">{t("secrets.deploymentDefault", { defaultValue: "Deployment default" })}</option>
              {selectedRotateProviderConfigs.map((config) => {
                  const blockReason = getProviderConfigBlockReason(config, t);
                return (
                  <option key={config.id} value={config.id} disabled={Boolean(blockReason)}>
                    {config.displayName}
                    {config.isDefault ? ` ${t("common.defaultParenthetical", { defaultValue: "(default)" })}` : ""}
                    {blockReason ? ` (${blockReason})` : ""}
                  </option>
                );
              })}
            </select>
            {selectedRotateProviderConfig ? (
              <ProviderVaultInlineWarning config={selectedRotateProviderConfig} />
            ) : (
              <p className="mt-1 text-(length:--text-micro) text-muted-foreground">
                {t("secrets.rotateWithDefaultHelp", {
                  defaultValue: "Rotating with the deployment default preserves current fallback behavior.",
                })}
              </p>
            )}
          </div>
          {selectedSecret?.managedMode === "external_reference" ? (
            <div>
              <label className="text-xs font-medium" htmlFor="rotate-ref">{t("secrets.externalReference", { defaultValue: "External reference" })}</label>
              <Input
                id="rotate-ref"
                value={rotateExternalRef}
                onChange={(event) => setRotateExternalRef(event.target.value)}
                placeholder={selectedSecret.externalRef ?? t("secrets.updatedReferencePlaceholder", { defaultValue: "Updated reference" })}
                className="font-mono text-xs"
              />
              <p className="mt-1 text-(length:--text-micro) text-muted-foreground">
                {t("secrets.rotateExternalReferenceHelp", {
                  defaultValue: "Rotate the actual value in the provider before changing this Paperclip reference.",
                })}
              </p>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium" htmlFor="rotate-value">{t("secrets.newValue", { defaultValue: "New value" })}</label>
              <Textarea
                id="rotate-value"
                value={rotateValue}
                onChange={(event) => setRotateValue(event.target.value)}
                rows={3}
                className="font-mono text-xs"
                placeholder={t("secrets.newValuePlaceholder", { defaultValue: "Paste the new value" })}
              />
            </div>
          )}
          {rotateError ? <p className="text-xs text-destructive">{rotateError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={() => {
                setRotateError(null);
                rotateMutation.mutate();
              }}
              disabled={
                rotateMutation.isPending ||
                Boolean(rotateProviderBlockReason) ||
                (selectedSecret?.managedMode === "external_reference"
                  ? !rotateExternalRef.trim() && !selectedSecret?.externalRef
                  : !rotateValue)
              }
            >
              {rotateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {selectedSecret?.managedMode === "external_reference"
                ? t("secrets.updateReference", { defaultValue: "Update reference" })
                : t("secrets.updateValue", { defaultValue: "Update value" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("secrets.deleteSecret", { defaultValue: "Delete secret" })}</DialogTitle>
            <DialogDescription>
              {t("secrets.deleteSecretDescriptionPrefix", { defaultValue: "Permanently removes" })} <strong>{deleteConfirm?.name}</strong>.{" "}
              {t("secrets.deleteSecretDescriptionSuffix", {
                defaultValue: "Active bindings will fail until you remap them.",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>{t("common.cancel", { defaultValue: "Cancel" })}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t("common.delete", { defaultValue: "Delete" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(definitionDeleteConfirm)}
        onOpenChange={(open) => !open && setDefinitionDeleteConfirm(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("secrets.deleteUserSecret", { defaultValue: "Delete user-provided secret" })}
            </DialogTitle>
            <DialogDescription>
              {t("secrets.deleteUserSecretDescriptionPrefix", {
                defaultValue: "Permanently removes",
              })}{" "}
              <strong>{definitionDeleteConfirm?.name}</strong>{" "}
              {t("secrets.deleteUserSecretDescriptionSuffix", {
                defaultValue:
                  "for the whole company. Existing member values become unreferenced and active bindings must be remapped.",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefinitionDeleteConfirm(null)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                definitionDeleteConfirm && deleteDefinitionMutation.mutate(definitionDeleteConfirm)
              }
              disabled={deleteDefinitionMutation.isPending}
            >
              {deleteDefinitionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t("common.delete", { defaultValue: "Delete" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SetMyUserSecretDialog
        companyId={selectedCompanyId}
        definition={setMyValueFor?.definition ?? null}
        existingSecret={setMyValueFor?.secret ?? null}
        open={setMyValueFor !== null}
        onOpenChange={(open) => {
          if (!open) setSetMyValueFor(null);
        }}
      />

      <Dialog open={Boolean(removeVaultConfirm)} onOpenChange={(open) => !open && setRemoveVaultConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("secrets.removeProviderVault", { defaultValue: "Remove provider vault" })}</DialogTitle>
            <DialogDescription>
              {t("secrets.removeProviderVaultPrefix", { defaultValue: "Removes " })}
              <strong>{removeVaultConfirm?.displayName}</strong>
              {t("secrets.removeProviderVaultMiddle", { defaultValue: " from Paperclip only. " })}
              {removeVaultConfirm?.provider === "aws_secrets_manager"
                ? t("secrets.removeProviderVaultAwsBody", {
                    defaultValue: "This does not delete the remote AWS Secrets Manager vault, secrets, or any AWS data.",
                  })
                : t("secrets.removeProviderVaultRemoteBody", { defaultValue: "This does not delete any remote provider data." })}{" "}
              {t("secrets.removeProviderVaultAssociationBody", {
                defaultValue: "Secrets using this vault will lose the vault association until you assign another one.",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveVaultConfirm(null)}>{t("common.cancel", { defaultValue: "Cancel" })}</Button>
            <Button
              variant="destructive"
              onClick={() => removeVaultConfirm && removeVaultMutation.mutate(removeVaultConfirm.id)}
              disabled={removeVaultMutation.isPending}
            >
              {removeVaultMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              {t("secrets.removeFromPaperclip", { defaultValue: "Remove from Paperclip" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

function SecretsHowToUse() {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">
          {t("secrets.howToUseTitle", { defaultValue: "Use secrets by binding them to runtime environment variables." })}
        </p>
        <p>
          {t("secrets.howToUseStep", {
            defaultValue: "Create or link a secret here, then open an agent's Environment variables or a project's Env field. Add the env key the process expects, for example",
          })}{" "}
          <code className="font-mono">GH_TOKEN</code>,{" "}
          {t("secrets.howToUseChoose", { defaultValue: "choose" })}{" "}
          <span className="font-medium text-foreground">{t("agentConfig.secret", { defaultValue: "Secret" })}</span>,{" "}
          {t("secrets.howToUseSelectVersion", { defaultValue: "and select the stored secret version." })}
        </p>
        <p>
          {t("secrets.howToUseResolution", {
            defaultValue: "Paperclip resolves the value server-side when the run starts and injects it as that env var. Project env applies to every issue in the project and overrides agent env on matching keys.",
          })}
        </p>
      </div>
    </div>
  );
}

function SecretsFiltersPopover({
  statusFilter,
  providerFilter,
  providedByFilter,
  providers,
  activeFilterCount,
  onStatusChange,
  onProviderChange,
  onProvidedByChange,
}: {
  statusFilter: SecretStatus | "all";
  providerFilter: SecretProvider | "all";
  providedByFilter: ProvidedByFilter;
  providers: SecretProviderDescriptor[];
  activeFilterCount: number;
  onStatusChange: (value: SecretStatus | "all") => void;
  onProviderChange: (value: SecretProvider | "all") => void;
  onProvidedByChange: (value: ProvidedByFilter) => void;
}) {
  const { t } = useTranslation();
  const resetFilters = () => {
    onStatusChange("active");
    onProviderChange("all");
    onProvidedByChange("all");
  };

  const statusOptions: Array<{ value: SecretStatus | "all"; label: string }> = [
    { value: "active", label: translateStatusLabel(t, "active") },
    { value: "all", label: t("secrets.allStatuses", { defaultValue: "All statuses" }) },
    { value: "disabled", label: translateStatusLabel(t, "disabled") },
    { value: "archived", label: translateStatusLabel(t, "archived") },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("relative h-8 w-8 shrink-0", activeFilterCount > 0 && "text-blue-600 dark:text-blue-400")}
          title={activeFilterCount > 0
            ? t("secrets.filtersCount", { count: activeFilterCount, defaultValue: "Filters: {{count}}" })
            : t("common.filter", { defaultValue: "Filter" })}
        >
          <Filter className="h-3.5 w-3.5" />
          {activeFilterCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-(length:--text-nano) font-bold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-(--sz-calc-41) max-h-(--sz-calc-42) overflow-y-auto overscroll-contain p-0"
      >
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("common.filters", { defaultValue: "Filters" })}</span>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={resetFilters}
              >
                <X className="h-3 w-3" />
                {t("common.clear", { defaultValue: "Clear" })}
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("common.status", { defaultValue: "Status" })}</span>
              <div className="space-y-0.5">
                {statusOptions.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                    <Checkbox
                      checked={statusFilter === option.value}
                      onCheckedChange={() => onStatusChange(option.value)}
                    />
                    <span className="text-sm">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("secrets.providedBy", { defaultValue: "Provided by" })}</span>
              <div className="space-y-0.5">
                {[
                  { value: "all" as const, label: t("secrets.allSources", { defaultValue: "All sources" }) },
                  { value: "company" as const, label: t("secrets.valueProvider.company", { defaultValue: "Company" }) },
                  { value: "user" as const, label: t("secrets.valueProvider.eachUser", { defaultValue: "Each user" }) },
                ].map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                    <Checkbox
                      checked={providedByFilter === option.value}
                      onCheckedChange={() => onProvidedByChange(option.value)}
                    />
                    <span className="text-sm">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("secrets.provider", { defaultValue: "Provider" })}</span>
              <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
                <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                  <Checkbox
                    checked={providerFilter === "all"}
                    onCheckedChange={() => onProviderChange("all")}
                  />
                  <span className="text-sm">{t("secrets.allProviders", { defaultValue: "All providers" })}</span>
                </label>
                {providers.map((provider) => (
                  <label key={provider.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50">
                    <Checkbox
                      checked={providerFilter === provider.id}
                      onCheckedChange={() => onProviderChange(provider.id)}
                    />
                    <span className="text-sm">{providerLabel(providers, provider.id, t)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function providerConfigStatusTone(status: SecretProviderConfigStatus) {
  switch (status) {
    case "ready":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "coming_soon":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "disabled":
      return "border-muted bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function providerFamilyIcon(provider: SecretProvider) {
  switch (provider) {
    case "local_encrypted":
      return Database;
    case "aws_secrets_manager":
      return Cloud;
    case "gcp_secret_manager":
      return ShieldCheck;
    case "vault":
      return KeyRound;
    default:
      return KeyRound;
  }
}

function ProviderVaultInlineWarning({ config }: { config: CompanySecretProviderConfig }) {
  const { t } = useTranslation();
                const blockReason = getProviderConfigBlockReason(config, t);
  const message = blockReason ?? config.healthMessage;
  if (!message) {
    return (
      <p className="mt-1 text-(length:--text-micro) text-muted-foreground">
        {config.isDefault
          ? t("secrets.defaultVault", { defaultValue: "Default vault" })
          : t("secrets.vault", { defaultValue: "Vault" })}{" "}
        · {translateStatusLabel(t, config.status)}
      </p>
    );
  }
  const warning = config.status === "warning" || config.healthStatus === "warning";
  return (
    <p className={cn("mt-1 flex items-center gap-1 text-(length:--text-micro)", warning ? "text-amber-600 dark:text-amber-400" : "text-destructive")}>
      {warning ? <AlertTriangle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {message}
    </p>
  );
}

interface ImportFromVaultButtonProps {
  providerConfigs: CompanySecretProviderConfig[];
  onClick: () => void;
  onManageVaults: () => void;
  className?: string;
}

function ImportFromVaultButton({
  providerConfigs,
  onClick,
  onManageVaults,
  className,
}: ImportFromVaultButtonProps) {
  const { t } = useTranslation();
  const awsConfigs = providerConfigs.filter(
    (config) => config.provider === "aws_secrets_manager",
  );
  const eligible = awsConfigs.filter(
    (config) => config.status === "ready" || config.status === "warning",
  );

  if (awsConfigs.length === 0) return null;

  if (eligible.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onManageVaults}
        className={cn("text-xs text-muted-foreground", className)}
        title={t("secrets.configureAwsVaultToImport", { defaultValue: "Configure an AWS provider vault to enable remote import" })}
      >
        <Cloud className="h-3.5 w-3.5 mr-1" /> {t("secrets.awsVaultDisabledManage", { defaultValue: "AWS vault disabled - manage" })}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={className}
      data-testid="import-from-vault-button"
    >
      <Cloud className="h-3.5 w-3.5 mr-1" /> {t("secrets.importFromVault", { defaultValue: "Import from vault" })}
    </Button>
  );
}

export function ProviderVaultsTab({
  providers,
  providerConfigs,
  loading,
  error,
  onRetry,
  onCreate,
  onEdit,
  onDisable,
  onRemove,
  onSetDefault,
  onHealthCheck,
  onImportSecrets,
  pendingActionId,
}: {
  providers: SecretProviderDescriptor[];
  providerConfigs: CompanySecretProviderConfig[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onCreate: (provider: SecretProvider) => void;
  onEdit: (config: CompanySecretProviderConfig) => void;
  onDisable: (config: CompanySecretProviderConfig) => void;
  onRemove: (config: CompanySecretProviderConfig) => void;
  onSetDefault: (config: CompanySecretProviderConfig) => void;
  onHealthCheck: (config: CompanySecretProviderConfig) => void;
  onImportSecrets: (config: CompanySecretProviderConfig) => void;
  pendingActionId: string | null;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("secrets.loadingProviderVaults", { defaultValue: "Loading provider vaults" })}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-sm text-destructive flex items-center gap-2">
        <AlertCircle className="h-4 w-4" /> {t("secrets.failedToLoadProviderVaults", { defaultValue: "Failed to load provider vaults:" })} {(error as Error).message}
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {t("common.retry", { defaultValue: "Retry" })}
        </Button>
      </div>
    );
  }

  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const providerRows = PROVIDER_ORDER.map((providerId) => ({
    id: providerId,
    provider: providerMap.get(providerId),
    Icon: providerFamilyIcon(providerId),
    isComingSoonFamily: providerId === "gcp_secret_manager" || providerId === "vault",
    configs: providerConfigs.filter((config) => config.provider === providerId),
  }));

  return (
    <div className="flex min-h-full gap-6">
      <aside className="hidden w-56 shrink-0 md:block">
        <nav className="sticky top-0 space-y-1">
          {providerRows.map(({ id, provider, Icon }) => (
            <a
              key={id}
              href={`#provider-vaults-${id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{providerLabel(providers, id, t)}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        {providerRows.map(({ id, provider, Icon, isComingSoonFamily, configs }) => (
          <section key={id} id={`provider-vaults-${id}`} className={cn("scroll-mt-6 space-y-2", isComingSoonFamily && "opacity-50")}>
            <div className="flex flex-wrap items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{providerLabel(providers, id, t)}</h2>
              {isComingSoonFamily ? (
                <span className="ml-auto text-xs text-muted-foreground">{t("status.comingSoon", { defaultValue: "Coming soon" })}</span>
              ) : (
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => onCreate(id)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t("secrets.addVault", { defaultValue: "Add vault" })}
                </Button>
              )}
            </div>
            {configs.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                {isComingSoonFamily
                  ? t("secrets.notYetSupported", { defaultValue: "Not yet supported." })
                  : t("secrets.noCompanyVaults", {
                      defaultValue: "No company-specific vaults yet. Secrets can still use the deployment default provider settings.",
                    })}
              </div>
            ) : (
              <div className="space-y-3">
                {configs.map((config) => (
                  <ProviderVaultCard
                    key={config.id}
                    config={config}
                    pending={pendingActionId === config.id}
                    onEdit={() => onEdit(config)}
                    onDisable={() => onDisable(config)}
                    onRemove={() => onRemove(config)}
                    onSetDefault={() => onSetDefault(config)}
                    onHealthCheck={() => onHealthCheck(config)}
                    onImportSecrets={() => onImportSecrets(config)}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function ProviderVaultCard({
  config,
  pending,
  onEdit,
  onDisable,
  onRemove,
  onSetDefault,
  onHealthCheck,
  onImportSecrets,
}: {
  config: CompanySecretProviderConfig;
  pending: boolean;
  onEdit: () => void;
  onDisable: () => void;
  onRemove: () => void;
  onSetDefault: () => void;
  onHealthCheck: () => void;
  onImportSecrets: () => void;
}) {
  const { t } = useTranslation();
  const blockReason = getProviderConfigBlockReason(config, t);
  const details = config.healthDetails;
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium leading-snug">{config.displayName}</h3>
            {config.isDefault ? (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <Star className="h-3 w-3 fill-current" />
                {t("common.default", { defaultValue: "Default" })}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("font-medium", providerConfigStatusTone(config.status))}>
              {translateStatusLabel(t, config.status)}
            </Badge>
            {config.healthStatus ? (
              <span className="text-xs text-muted-foreground">
                {t("secrets.healthStatusCheckedAt", {
                  status: translateStatusLabel(t, config.healthStatus),
                  time: formatRelative(config.healthCheckedAt, t),
                  defaultValue: "Health {{status}} · {{time}}",
                })}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t("secrets.healthNotChecked", { defaultValue: "Health not checked" })}</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {config.healthMessage || blockReason ? (
        <div className={cn("mt-3 rounded-md p-2 text-xs", blockReason ? "bg-destructive/5 text-destructive" : "bg-muted/40 text-muted-foreground")}>
          {blockReason ?? config.healthMessage}
          {details?.guidance?.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {details.guidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onHealthCheck} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          {t("secrets.checkHealth", { defaultValue: "Check health" })}
        </Button>
        {config.provider === "aws_secrets_manager" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onImportSecrets}
            disabled={pending || Boolean(blockReason)}
            title={
              blockReason
                ? blockReason
                : "Refresh AWS metadata and import existing secrets"
            }
            data-testid={`provider-vault-refresh-secrets-${config.id}`}
          >
            <Cloud className="h-3.5 w-3.5 mr-1" />
            Refresh secrets
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={onSetDefault}
          disabled={pending || Boolean(blockReason) || config.isDefault}
        >
          <Star className="h-3.5 w-3.5 mr-1" />
          {t("secrets.makeDefault", { defaultValue: "Make default" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDisable}
          disabled={pending || config.status === "disabled"}
        >
          <Ban className="h-3.5 w-3.5 mr-1" />
          {t("common.disable", { defaultValue: "Disable" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
          disabled={pending}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Remove
        </Button>
      </div>
    </div>
  );
}

function ProviderVaultFields({
  form,
  onChange,
}: {
  form: ProviderVaultForm;
  onChange: React.Dispatch<React.SetStateAction<ProviderVaultForm>>;
}) {
  const { t } = useTranslation();
  const setField = (key: keyof ProviderVaultForm, value: string | boolean) => {
    onChange((current) => ({ ...current, [key]: value }));
  };

  if (form.provider === "local_encrypted") {
    return (
      <label className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-border"
          checked={form.backupReminderAcknowledged}
          onChange={(event) => setField("backupReminderAcknowledged", event.target.checked)}
        />
        <span>
          {t("secrets.localEncryptedBackupWarning", {
            defaultValue: "I understand backup and restore require both the database metadata and the local encrypted master key file.",
          })}
        </span>
      </label>
    );
  }

  if (form.provider === "aws_secrets_manager") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("secrets.awsRegion", { defaultValue: "AWS region" })} value={form.region} onChange={(value) => setField("region", value)} placeholder="us-east-1" required />
        <TextField label={t("secrets.namespace", { defaultValue: "Namespace" })} value={form.namespace} onChange={(value) => setField("namespace", value)} placeholder="production" />
        <TextField label={t("secrets.secretNamePrefix", { defaultValue: "Secret name prefix" })} value={form.secretNamePrefix} onChange={(value) => setField("secretNamePrefix", value)} placeholder="paperclip" />
        <TextField label={t("secrets.kmsKeyId", { defaultValue: "KMS key id" })} value={form.kmsKeyId} onChange={(value) => setField("kmsKeyId", value)} placeholder="alias/paperclip-secrets" />
        <TextField label={t("secrets.ownerTag", { defaultValue: "Owner tag" })} value={form.ownerTag} onChange={(value) => setField("ownerTag", value)} placeholder="platform" />
        <TextField label={t("secrets.environmentTag", { defaultValue: "Environment tag" })} value={form.environmentTag} onChange={(value) => setField("environmentTag", value)} placeholder="prod" />
      </div>
    );
  }

  if (form.provider === "gcp_secret_manager") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("secrets.projectId", { defaultValue: "Project id" })} value={form.projectId} onChange={(value) => setField("projectId", value)} placeholder="paperclip-prod" />
        <TextField label={t("secrets.location", { defaultValue: "Location" })} value={form.location} onChange={(value) => setField("location", value)} placeholder="global" />
        <TextField label={t("secrets.namespace", { defaultValue: "Namespace" })} value={form.namespace} onChange={(value) => setField("namespace", value)} placeholder="production" />
        <TextField label={t("secrets.secretNamePrefix", { defaultValue: "Secret name prefix" })} value={form.secretNamePrefix} onChange={(value) => setField("secretNamePrefix", value)} placeholder="paperclip" />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label={t("secrets.address", { defaultValue: "Address" })} value={form.address} onChange={(value) => setField("address", value)} placeholder="https://vault.example.com" />
      <TextField label={t("secrets.namespace", { defaultValue: "Namespace" })} value={form.namespace} onChange={(value) => setField("namespace", value)} placeholder="admin" />
      <TextField label={t("secrets.mountPath", { defaultValue: "Mount path" })} value={form.mountPath} onChange={(value) => setField("mountPath", value)} placeholder="secret" />
      <TextField label={t("secrets.secretPathPrefix", { defaultValue: "Secret path prefix" })} value={form.secretPathPrefix} onChange={(value) => setField("secretPathPrefix", value)} placeholder="paperclip/prod" />
    </div>
  );
}

function AwsProviderVaultDiscoveryPanel({
  form,
  preview,
  error,
  loading,
  onDiscover,
  onApply,
}: {
  form: ProviderVaultForm;
  preview: SecretProviderConfigDiscoveryPreviewResult | null;
  error: unknown | null;
  loading: boolean;
  onDiscover: () => void;
  onApply: (candidate: SecretProviderConfigDiscoveryCandidate) => void;
}) {
  const { t } = useTranslation();
  const canDiscover = Boolean(form.region.trim());
  const warnings = preview?.warnings ?? [];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("secrets.awsDiscovery", { defaultValue: "AWS discovery" })}</p>
          <p className="text-xs text-muted-foreground">
            {t("secrets.awsDiscoveryDescription", {
              defaultValue: "Uses the current draft routing fields to inspect AWS Secrets Manager metadata. Values are not read.",
            })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDiscover}
          disabled={!canDiscover || loading}
          data-testid="aws-vault-discovery-button"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Search className="h-3.5 w-3.5 mr-1" />
          )}
          {t("secrets.findExistingAwsValues", { defaultValue: "Find existing AWS values" })}
        </Button>
      </div>

      {!canDiscover ? (
        <p className="text-xs text-muted-foreground">{t("secrets.enterAwsRegionBeforeDiscovery", { defaultValue: "Enter an AWS region before discovery." })}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("secrets.searchingAwsMetadata", { defaultValue: "Searching AWS Secrets Manager metadata" })}
        </div>
      ) : null}

      {error ? (
        <AwsProviderVaultDiscoveryError form={form} error={error} />
      ) : null}

      {warnings.length > 0 ? (
        <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
          {warnings.map((warning) => (
            <div key={warning} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      ) : null}

      {preview && preview.candidates.length === 0 && !loading ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          {t("secrets.noAwsCandidates", { defaultValue: "No AWS vault metadata candidates found. Manual entry is still available." })}
        </div>
      ) : null}

      {preview && preview.candidates.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            <span>
              {t("secrets.awsCandidateSummary", {
                candidateCount: preview.candidates.length,
                sampledSecretCount: preview.sampledSecretCount,
                defaultValue: "{{candidateCount}} candidates from {{sampledSecretCount}} sampled secrets",
              })}
            </span>
          </div>
          <div className="space-y-2" data-testid="aws-vault-discovery-candidates">
            {preview.candidates.map((candidate, index) => (
              <AwsProviderVaultDiscoveryCandidateRow
                key={`${candidate.displayName}-${index}`}
                candidate={candidate}
                onApply={() => onApply(candidate)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AwsProviderVaultDiscoveryError({
  form,
  error,
}: {
  form: ProviderVaultForm;
  error: unknown;
}) {
  const { t } = useTranslation();
  const details = apiErrorDetails(error);
  const isAccessDenied = isAwsDiscoveryAccessDenied(error);
  const region = (details?.region ?? form.region.trim()) || "unspecified";
  const message = readableErrorMessage(error);
  const safeDetails = {
    message,
    status: error instanceof ApiError ? error.status : undefined,
    provider: details?.provider ?? form.provider,
    operation: details?.operation ?? "secret_provider_config.discovery.preview",
    providerVaultContext: details?.providerVaultContext ?? "draft_config",
    region,
    code: details?.code,
    requiredCapability: details?.requiredCapability,
    credentialPath: details?.credentialPath,
    safeAlternative: details?.safeAlternative,
  };
  const detailsText = JSON.stringify(safeDetails, null, 2);

  const copyDetails = () => {
    void navigator.clipboard?.writeText(detailsText);
  };

  return (
    <div
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
      role="alert"
      data-testid="aws-vault-discovery-error"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-medium">
              {isAccessDenied
                ? t("secrets.awsDiscoveryNeedsListSecrets", { defaultValue: "AWS discovery needs ListSecrets permission" })
                : t("secrets.awsDiscoveryFailed", { defaultValue: "AWS discovery failed" })}
            </p>
            <p className="mt-1 leading-relaxed text-destructive/85">
              {isAccessDenied
                ? details?.actionableMessage ??
                  t("secrets.awsDiscoveryNeedsListSecretsDescription", {
                    defaultValue: "Discovery needs secretsmanager:ListSecrets in the selected region for the Paperclip server runtime/provider credential path.",
                  })
                : message}
            </p>
          </div>
          {isAccessDenied ? (
            <p className="leading-relaxed text-destructive/85">
              {details?.safeAlternative ??
                t("secrets.awsDiscoveryExactArnAlternative", {
                  defaultValue: "If you already know the exact AWS Secrets Manager ARN, paste/link that ARN instead of using discovery. Exact-resource DescribeSecret and runtime read permissions are still required.",
                })}
            </p>
          ) : null}
          <dl className="grid gap-1 text-destructive/80 sm:grid-cols-2">
            <div>
              <dt className="font-medium">{t("secrets.region", { defaultValue: "Region" })}</dt>
              <dd>{region}</dd>
            </div>
            <div>
              <dt className="font-medium">{t("secrets.operation", { defaultValue: "Operation" })}</dt>
              <dd>{details?.operation ?? "secret_provider_config.discovery.preview"}</dd>
            </div>
            <div>
              <dt className="font-medium">{t("secrets.provider", { defaultValue: "Provider" })}</dt>
              <dd>{details?.provider ?? "aws_secrets_manager"}</dd>
            </div>
            <div>
              <dt className="font-medium">{t("secrets.vaultContext", { defaultValue: "Vault context" })}</dt>
              <dd>{details?.providerVaultContext ?? "draft_config"}</dd>
            </div>
          </dl>
          <div className="rounded-md border border-destructive/20 bg-background/70 p-2 text-foreground">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-muted-foreground">
                {t("secrets.safeRequestErrorDetails", { defaultValue: "Safe request/error details" })}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={copyDetails}>
                {t("common.copy", { defaultValue: "Copy" })}
              </Button>
            </div>
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-(length:--text-micro) leading-relaxed">
              {detailsText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecretCreateError({
  error,
  provider,
  providerConfigId,
}: {
  error: unknown;
  provider: SecretProvider;
  providerConfigId: string | null;
}) {
  const { t } = useTranslation();
  const details = apiErrorDetails(error);
  const message = readableErrorMessage(error);
  const isAwsCreateError =
    details?.provider === "aws_secrets_manager" && details.operation === "secret.create";
  const isAccessDenied = isAwsCreateError && details.code === "access_denied";
  const safeDetails = {
    message,
    status: error instanceof ApiError ? error.status : undefined,
    provider: details?.provider ?? provider,
    operation: details?.operation ?? "secret.create",
    providerConfigId: details?.providerConfigId ?? providerConfigId ?? "deployment-default",
    region: details?.region,
    code: details?.code,
    requiredCapability: details?.requiredCapability,
    credentialPath: details?.credentialPath,
    safeAlternative: details?.safeAlternative,
  };
  const detailsText = JSON.stringify(safeDetails, null, 2);

  if (!isAwsCreateError) {
    return (
      <p className="text-xs text-destructive" role="alert" data-testid="secret-create-error">
        {message}
      </p>
    );
  }

  return (
    <div
      className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
      role="alert"
      data-testid="secret-create-error"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-medium">
              {isAccessDenied
                ? t("secrets.awsCreateNeedsPermission", {
                  defaultValue: "AWS secret creation needs CreateSecret permission",
                })
                : t("secrets.awsCreateFailed", { defaultValue: "AWS secret creation failed" })}
            </p>
            <p className="mt-1 leading-relaxed text-destructive/85">
              {isAccessDenied
                ? t("secrets.awsCreateNeedsPermissionDescription", {
                  defaultValue: "AWS managed secret creation needs secretsmanager:CreateSecret in the selected region for this provider vault. If the vault config uses a KMS key, the runtime credentials also need KMS write permissions for that key.",
                })
                : details?.actionableMessage ?? message}
            </p>
          </div>
          {isAccessDenied && details?.safeAlternative ? (
            <p className="leading-relaxed text-destructive/85">
              {t("secrets.awsCreateExistingSecretAlternative", {
                defaultValue: "If the secret already exists in AWS, link it as an external reference instead of creating a Paperclip-managed value.",
              })}
            </p>
          ) : null}
          <dl className="grid gap-1 text-destructive/80 sm:grid-cols-2">
            {details?.requiredCapability ? (
              <div>
                <dt className="font-medium">
                  {t("secrets.requiredIamCapability", { defaultValue: "Required IAM capability" })}
                </dt>
                <dd className="font-mono">{details.requiredCapability}</dd>
              </div>
            ) : null}
            {details?.region ? (
              <div>
                <dt className="font-medium">{t("secrets.region", { defaultValue: "Region" })}</dt>
                <dd>{details.region}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-medium">{t("secrets.providerVault", { defaultValue: "Provider vault" })}</dt>
              <dd className="break-all">
                {details?.providerConfigId ?? providerConfigId ?? t("secrets.deploymentDefault", {
                  defaultValue: "Deployment default",
                })}
              </dd>
            </div>
            <div>
              <dt className="font-medium">{t("secrets.operation", { defaultValue: "Operation" })}</dt>
              <dd>{details?.operation ?? "secret.create"}</dd>
            </div>
          </dl>
          <div className="rounded-md border border-destructive/20 bg-background/70 p-2 text-foreground">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-muted-foreground">
                {t("secrets.safeRequestErrorDetails", { defaultValue: "Safe request/error details" })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void navigator.clipboard?.writeText(detailsText)}
              >
                {t("common.copy", { defaultValue: "Copy" })}
              </Button>
            </div>
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words font-mono text-(length:--text-micro) leading-relaxed">
              {detailsText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function AwsProviderVaultDiscoveryCandidateRow({
  candidate,
  onApply,
}: {
  candidate: SecretProviderConfigDiscoveryCandidate;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const fieldSummary = [
    providerConfigValue(candidate.config, "region"),
    providerConfigValue(candidate.config, "namespace"),
    providerConfigValue(candidate.config, "secretNamePrefix"),
  ].filter(Boolean);

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium leading-snug">{candidate.displayName}</p>
            <span className="text-xs text-muted-foreground">
              {candidate.sampleCount} sample{candidate.sampleCount === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {fieldSummary.length > 0 ? fieldSummary.join(" / ") : t("secrets.noStableNamespace", { defaultValue: "No stable namespace or prefix detected" })}
          </p>
          {candidate.samples[0] ? (
            <p className="mt-1 truncate font-mono text-(length:--text-micro) text-muted-foreground">
              {candidate.samples[0].name}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onApply}>
          {t("secrets.useValues", { defaultValue: "Use values" })}
        </Button>
      </div>
      {candidate.warnings.length > 0 ? (
        <div className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
          {candidate.warnings.map((warning) => (
            <div key={warning} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const { t } = useTranslation();
  const id = `provider-vault-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label className="text-xs font-medium" htmlFor={id}>
        {label}
        {required ? null : <span className="text-muted-foreground/70"> {t("common.optionalParenthetical", { defaultValue: "(optional)" })}</span>}
      </label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function CoverageInline({
  companyId,
  definitionId,
  compact = false,
}: {
  companyId: string;
  definitionId: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const coverageQuery = useQuery({
    queryKey: queryKeys.secrets.userDefinitionCoverage(companyId, definitionId),
    queryFn: () => secretsApi.userSecretDefinitionCoverage(companyId, definitionId),
    staleTime: 30_000,
  });
  const summary = coverageQuery.data;
  if (coverageQuery.isPending) {
    return <span className="text-muted-foreground">{t("common.loadingEllipsis", { defaultValue: "Loading..." })}</span>;
  }
  if (coverageQuery.isError) {
    return <span className="text-destructive">{t("secrets.coverageUnavailable", { defaultValue: "Coverage unavailable" })}</span>;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
      <Users className="h-3 w-3" />
      <span className="truncate">
        {compact && summary
          ? t("secrets.coverageCompact", {
              configured: summary.configuredCount,
              total: summary.configuredCount + summary.missingCount + summary.inactiveCount,
              defaultValue: "{{configured}}/{{total}} set",
            })
          : coverageSummaryLabel(summary, t)}
      </span>
      {summary && summary.missingCount > 0 ? (
        <span className="shrink-0 text-amber-600 dark:text-amber-400">
          · {compact
            ? t("secrets.coverageMissingCompact", {
                count: summary.missingCount,
                defaultValue: "{{count}} miss",
              })
            : t("secrets.coverageMissingCount", {
                count: summary.missingCount,
                defaultValue: "{{count}} missing",
              })}
        </span>
      ) : null}
    </span>
  );
}

function UserSecretDetailsTab({
  companyId,
  definition,
  onViewCoverage,
}: {
  companyId: string;
  definition: UserSecretDefinition;
  onViewCoverage: () => void;
}) {
  const { t } = useTranslation();
  return (
    <dl className="divide-y divide-border/60 text-xs">
      <DetailRow label={t("common.description", { defaultValue: "Description" })}>
        <span>{definition.description ?? <span className="text-muted-foreground">—</span>}</span>
      </DetailRow>
      <DetailRow label={t("secrets.providedBy", { defaultValue: "Provided by" })}>
        {t("secrets.valueProvider.eachUser", { defaultValue: "Each user" })}
      </DetailRow>
      <DetailRow label={t("common.key", { defaultValue: "Key" })}>
        <code>{definition.key}</code>
      </DetailRow>
      <DetailRow label={t("common.status", { defaultValue: "Status" })}><StatusBadge status={definition.status} /></DetailRow>
      <DetailRow label={t("secrets.coverage", { defaultValue: "Coverage" })}>
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1 text-left text-primary hover:underline"
          onClick={onViewCoverage}
        >
          <CoverageInline companyId={companyId} definitionId={definition.id} />
          <span className="shrink-0 text-muted-foreground">
            {t("secrets.viewInCoverage", { defaultValue: "· View in Coverage" })}
          </span>
        </button>
      </DetailRow>
      <DetailRow label={t("common.created", { defaultValue: "Created" })}>{formatRelative(definition.createdAt, t)}</DetailRow>
      <DetailRow label={t("common.updated", { defaultValue: "Updated" })}>{formatRelative(definition.updatedAt, t)}</DetailRow>
      <DetailRow label={t("secrets.usageGuidance", { defaultValue: "Usage guidance" })}>
        {definition.usageGuidance ?? <span className="text-muted-foreground">—</span>}
      </DetailRow>
      <div className="mt-3 rounded-md border border-violet-500/30 bg-violet-500/5 p-2 text-(length:--text-micro) text-violet-800 dark:text-violet-200">
        {t("secrets.userDefinitionNoValue", {
          defaultValue: "No value is stored on this admin row. Each member manages their own value under My secrets.",
        })}
      </div>
    </dl>
  );
}

function UserSecretCoverageTab({
  companyId,
  definitionId,
}: {
  companyId: string;
  definitionId: string;
}) {
  const { t } = useTranslation();
  const coverageQuery = useQuery({
    queryKey: queryKeys.secrets.userDefinitionCoverage(companyId, definitionId),
    queryFn: () => secretsApi.userSecretDefinitionCoverage(companyId, definitionId),
    staleTime: 30_000,
  });
  if (coverageQuery.isPending) {
    return <div className="py-6 text-center text-xs text-muted-foreground">{t("common.loadingEllipsis", { defaultValue: "Loading..." })}</div>;
  }
  if (coverageQuery.isError) {
    return <div className="py-6 text-center text-xs text-destructive">{t("secrets.coverageUnavailable", { defaultValue: "Coverage unavailable." })}</div>;
  }
  const summary: UserSecretCoverageSummary = coverageQuery.data;
  const total = summary.configuredCount + summary.missingCount + summary.inactiveCount;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{coverageSummaryLabel(summary, t)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
            {summary.configuredCount}
          </div>
          <div className="text-muted-foreground">{t("secrets.coverageSet", { defaultValue: "Set" })}</div>
        </div>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="text-lg font-semibold text-amber-700 dark:text-amber-300">
            {summary.missingCount}
          </div>
          <div className="text-muted-foreground">{t("secrets.coverageMissing", { defaultValue: "Missing" })}</div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="text-lg font-semibold text-muted-foreground">
            {summary.inactiveCount}
          </div>
          <div className="text-muted-foreground">{t("secrets.coverageInactive", { defaultValue: "Inactive" })}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("secrets.coverageCountsOnly", {
          count: total,
          defaultValue: "Coverage is counts only across {{count}} members. Secret values are never shown here.",
        })}
      </p>
    </div>
  );
}

function UserSecretUsageTab({ definition }: { definition: UserSecretDefinition }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 text-xs text-muted-foreground">
      <div className="rounded-md border border-border bg-muted/20 p-3">
        {t("secrets.bindUserSecretPrefix", {
          defaultValue: "Bind runtime environment variables to this user-provided secret by choosing",
        })}{" "}
        <span className="font-medium text-foreground">{t("secrets.userSecret", { defaultValue: "User secret" })}</span>{" "}
        {t("secrets.andSelecting", { defaultValue: "and selecting" })}{" "}
        <code className="font-mono">{definition.key}</code>.
      </div>
      {definition.usageGuidance ? (
        <div>
          <p className="mb-1 text-(length:--text-micro) uppercase tracking-wide text-muted-foreground">{t("secrets.memberGuidance", { defaultValue: "Member guidance" })}</p>
          <p className="text-foreground">{definition.usageGuidance}</p>
        </div>
      ) : null}
    </div>
  );
}

function UserSecretAccessEventsTab() {
  const { t } = useTranslation();
  return (
    <div className="py-6 text-center text-xs text-muted-foreground">
      {t("secrets.userAccessEventsDescription", {
        defaultValue: "Access events are recorded on each member's stored value when runtime resolution occurs.",
      })}
    </div>
  );
}

function SecretDetailsTab({
  secret,
  providers,
  providerConfigs,
  onViewUsage,
}: {
  secret: CompanySecret;
  providers: SecretProviderDescriptor[];
  providerConfigs: CompanySecretProviderConfig[];
  onViewUsage: () => void;
}) {
  const { t } = useTranslation();
  const bindingLabel = (secret.referenceCount ?? 0) === 1
    ? t("secrets.bindingCount", { count: 1, defaultValue: "1 binding" })
    : t("secrets.bindingCount", { count: secret.referenceCount ?? 0, defaultValue: "{{count}} bindings" });

  return (
    <dl className="divide-y divide-border/60 text-xs">
      <DetailRow label={t("common.description", { defaultValue: "Description" })}>
        <span>{secret.description ?? <span className="text-muted-foreground">—</span>}</span>
      </DetailRow>
      <DetailRow label={t("secrets.providedBy", { defaultValue: "Provided by" })}>{t("secrets.valueProvider.company", { defaultValue: "Company" })}</DetailRow>
      <DetailRow label={t("secrets.custody", { defaultValue: "Custody" })}>{modeLabel(secret.managedMode, t)}</DetailRow>
      <DetailRow label={t("secrets.provider", { defaultValue: "Provider" })}>{providerLabel(providers, secret.provider, t)}</DetailRow>
      <DetailRow label={t("secrets.providerVault", { defaultValue: "Provider vault" })}>{providerVaultLabel(providerConfigs, secret.providerConfigId, t)}</DetailRow>
      <DetailRow label={t("secrets.externalArn", { defaultValue: "External ARN" })}>
        {secret.externalRef ? (
          <span className="break-all font-mono">{secret.externalRef}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </DetailRow>
      <DetailRow label={t("secrets.latestVersion", { defaultValue: "Latest version" })}>v{secret.latestVersion}</DetailRow>
      <DetailRow label={t("secrets.references", { defaultValue: "References" })}>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-left text-primary hover:underline"
          onClick={onViewUsage}
        >
          {bindingLabel}
          <span className="text-muted-foreground">{t("secrets.viewInUsage", { defaultValue: "· View in Usage" })}</span>
        </button>
      </DetailRow>
      <DetailRow label={t("common.created", { defaultValue: "Created" })}>{formatRelative(secret.createdAt, t)}</DetailRow>
      <DetailRow label={t("common.updated", { defaultValue: "Updated" })}>{formatRelative(secret.updatedAt, t)}</DetailRow>
      <DetailRow label={t("secrets.lastRotated", { defaultValue: "Last rotated" })}>{formatRelative(secret.lastRotatedAt, t)}</DetailRow>
      <DetailRow label={t("secrets.lastResolved", { defaultValue: "Last resolved" })}>{formatRelative(secret.lastResolvedAt, t)}</DetailRow>
      <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-(length:--text-micro) text-amber-700 dark:text-amber-300">
        {modeDescription(secret.managedMode, t)}{" "}
        {t("secrets.neverRedisplaysValues", { defaultValue: "Paperclip never re-displays stored values." })}
      </div>
    </dl>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-(--gtc-55) gap-3 py-2">
      <dt className="text-(length:--text-micro) uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

function SecretUsageTab({ loading, bindings }: { loading: boolean; bindings: CompanySecretUsageBinding[] }) {
  const { t } = useTranslation();
  if (loading) {
    return <div className="py-6 text-center text-xs text-muted-foreground">{t("common.loadingEllipsis", { defaultValue: "Loading..." })}</div>;
  }
  if (bindings.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        {t("secrets.noActiveBindings", {
          defaultValue: "No active bindings. Add this secret in agent, project, environment, or plugin config to start using it.",
        })}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {bindings.map((binding) => (
        <div
          key={binding.id}
          className="rounded-md border border-border bg-muted/30 p-2 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium capitalize">{humanizeEnumValue(binding.target.type)}</span>
            <span className="font-mono text-muted-foreground">v{binding.versionSelector}</span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            {binding.target.href ? (
              <Link to={binding.target.href} className="truncate font-medium text-primary hover:underline">
                {binding.target.label}
              </Link>
            ) : (
              <span className="truncate font-medium">{binding.target.label}</span>
            )}
            {binding.target.status ? (
              <Badge variant="outline" className="h-5 px-1.5 text-(length:--text-nano) font-normal">
                {translateStatusLabel(t, binding.target.status)}
              </Badge>
            ) : null}
          </div>
          <div className="font-mono text-(length:--text-micro) text-muted-foreground break-all">
            {binding.targetId}
          </div>
          <div className="text-(length:--text-micro) text-muted-foreground">
            {binding.configPath}{" "}
            {binding.required
              ? t("secrets.requiredSuffix", { defaultValue: "· required" })
              : t("secrets.optionalSuffix", { defaultValue: "· optional" })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SecretEventsTab({
  loading,
  events,
  companyId,
}: {
  loading: boolean;
  events: SecretAccessEvent[];
  companyId: string;
}) {
  const { t } = useTranslation();
  // Resolve responsible/owner user ids to human names for user-scoped events.
  const anyUserScoped = events.some(
    (event) =>
      event.secretScope === "user" || event.responsibleUserId || event.credentialOwnerUserId,
  );
  const { data: directory } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(companyId),
    queryFn: () => accessApi.listUserDirectory(companyId),
    enabled: anyUserScoped,
    staleTime: 60_000,
  });
  const userLabel = (userId: string | null): string => {
    if (!userId) return "—";
    const entry: CompanyUserDirectoryEntry | undefined = directory?.users.find(
      (u) => u.principalId === userId,
    );
    return entry?.user?.name?.trim() || entry?.user?.email?.trim() || `${userId.slice(0, 8)}…`;
  };
  if (loading) {
    return <div className="py-6 text-center text-xs text-muted-foreground">{t("common.loadingEllipsis", { defaultValue: "Loading..." })}</div>;
  }
  if (events.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        {t("secrets.noAccessEvents", {
          defaultValue: "No access events recorded yet. Each runtime resolution writes a redacted entry here.",
        })}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {events.map((event) => (
        <div key={event.id} className="rounded border border-border px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 capitalize">
              {humanizeEnumValue(event.consumerType)} · {translateStatusLabel(t, event.outcome)}
              {event.secretScope === "user" ? (
                <Badge
                  variant="outline"
                  className="border-violet-500/30 bg-violet-500/10 text-(length:--text-nano) text-violet-700 dark:text-violet-300"
                >
                  {t("secrets.userSecret", { defaultValue: "User secret" })}
                </Badge>
              ) : null}
            </span>
            <span className="text-(length:--text-micro) text-muted-foreground">{formatRelative(event.createdAt, t)}</span>
          </div>
          <div className="font-mono text-(length:--text-micro) text-muted-foreground break-all">
            {event.consumerId}
          </div>
          {event.responsibleUserId ? (
            <div className="text-(length:--text-micro) text-muted-foreground">
              {t("secrets.responsibleUser", { defaultValue: "Responsible user" })}: <span className="text-foreground">{userLabel(event.responsibleUserId)}</span>
            </div>
          ) : null}
          {event.credentialOwnerUserId &&
          event.credentialOwnerUserId !== event.responsibleUserId ? (
            <div className="text-(length:--text-micro) text-muted-foreground">
              {t("secrets.credentialOwner", { defaultValue: "Credential owner" })}: <span className="text-foreground">{userLabel(event.credentialOwnerUserId)}</span>
            </div>
          ) : null}
          {event.errorCode ? (
            <div className="text-(length:--text-micro) text-destructive">{event.errorCode}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
