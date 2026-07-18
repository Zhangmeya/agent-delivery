import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  ClipboardPaste,
  Link2,
  Loader2,
  Lock,
  Search,
  TerminalSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  Agent,
  AppGalleryEntry,
  ConnectToolAppResult,
  ToolAppConnectionActionSummary,
} from "@penclipai/shared";
import { getToolAppGalleryEntryForUrl } from "@penclipai/shared";
import { useNavigate, useParams, useSearchParams } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { ApiError } from "@/api/client";
import { toolsApi } from "@/api/tools";
import { agentsApi } from "@/api/agents";
import { appCopyFor, credentialFieldLabel } from "@/lib/app-gallery-copy";
import { advancedTabHref } from "@/pages/tools/tool-tabs";
import { AgentIcon } from "@/components/AgentIconPicker";
import { AgentMultiSelect } from "@/components/AgentMultiSelect";
import { InlineBanner } from "@/components/InlineBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AppLogo } from "./AppLogo";
import { parseGoogleSheetIds } from "./google-sheets";
import { autoExtendNotice, INSTALL_ALL_WARNING, installInfoNotice, installPayload } from "@/lib/tool-installs";

type Step = "gallery" | "key" | "actions" | "who" | "install" | "success";

const ROUTE_STAGE_BY_STEP: Partial<Record<Step, string>> = {
  key: "setup",
  actions: "actions",
  who: "access",
  install: "install",
  success: "complete",
};

function appConnectHref(appKey: string, step: Step): string {
  const stage = ROUTE_STAGE_BY_STEP[step] ?? "setup";
  const params = new URLSearchParams({ byo: "1", appKey, stage });
  return `/apps/connect?${params.toString()}`;
}
type AppAccessSelection = "all_agents" | { agentIds: string[] };
type InstallMode = "none" | "specific" | "all";
const LINK_CREDENTIAL_CONFIG_PATH = "credentials.authorization";

const STEP_LABELS = ["Pick app", "Add your key", "Choose actions", "Choose access", "Install tools"];
const STEP_INDEX: Record<Exclude<Step, "success">, number> = {
  gallery: 0,
  key: 1,
  actions: 2,
  who: 3,
  install: 4,
};
const ZAPIER_STEP_INDEX: Record<Exclude<Step, "gallery" | "success">, number> = {
  key: 0,
  actions: 1,
  who: 2,
  install: 3,
};
const ZAPIER_STEP_LABELS = ["Add MCP URL", "Choose actions", "Choose access", "Install tools"];

const STEP_LABEL_KEYS: Record<string, string> = {
  "Pick app": "apps.connect.steps.pickApp",
  "Add your key": "apps.connect.steps.addKey",
  "Share sheet": "apps.connect.steps.shareSheet",
  "Add MCP URL": "apps.connect.steps.addMcpUrl",
  "Choose actions": "apps.connect.steps.chooseActions",
  "Choose access": "apps.connect.steps.chooseAccess",
  "Install tools": "apps.connect.steps.installTools",
};

function askFirstLevelsFrom(result: ConnectToolAppResult): string[] {
  const raw = (result.suggestedDefaults as { askFirstRiskLevels?: unknown })?.askFirstRiskLevels;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : ["write", "destructive"];
}

function isGoogleSheetsEntry(entry: AppGalleryEntry | null): boolean {
  return entry?.key === "google-sheets";
}

export function AppsConnect() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const routeParams = useParams<{ appKey?: string }>();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();
  const appKey = routeParams.appKey ?? searchParams.get("appKey") ?? undefined;
  const zapierSource = searchParams.get("source") === "zapier";

  // Prefill arrives from the app page for reconnects; read once so later
  // wizard navigation doesn't fight the URL.
  const [prefill] = useState(() => {
    const rawLink = searchParams.get("link")?.trim() ?? "";
    return {
      link: /^https?:\/\//i.test(rawLink) ? rawLink : "",
      name: searchParams.get("name")?.trim() ?? "",
      applicationId: searchParams.get("applicationId")?.trim() || undefined,
    };
  });

  const [step, setStep] = useState<Step>(appKey || prefill.link || zapierSource ? "key" : "gallery");
  const [entry, setEntry] = useState<AppGalleryEntry | null>(null);
  const [galleryName, setGalleryName] = useState("");
  const [linkUrl, setLinkUrl] = useState(prefill.link);
  const [linkName, setLinkName] = useState(prefill.name || (zapierSource ? "Zapier" : ""));
  const [linkNeedsKey, setLinkNeedsKey] = useState(false);
  const [linkKey, setLinkKey] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [googleSheetsLinks, setGoogleSheetsLinks] = useState("");
  const [googleSheetsError, setGoogleSheetsError] = useState<string | null>(null);
  const [connectResult, setConnectResult] = useState<ConnectToolAppResult | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [access, setAccess] = useState<"all" | "specific">("all");
  const [agentIds, setAgentIds] = useState<Set<string>>(new Set());
  const [installMode, setInstallMode] = useState<InstallMode>("none");
  const [installAgentIds, setInstallAgentIds] = useState<Set<string>>(new Set());

  const openGallery = () => {
    setEntry(null);
    setGalleryName("");
    setLinkUrl("");
    setLinkName("");
    setLinkNeedsKey(false);
    setLinkKey("");
    setCredentials({});
    setGoogleSheetsLinks("");
    setGoogleSheetsError(null);
    setConnectResult(null);
    setInstallMode("none");
    setInstallAgentIds(new Set());
    setStep("gallery");
    navigate("/apps/connect?byo=1");
  };

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("apps.common.company", { defaultValue: "Company" }), href: "/dashboard" },
      { label: t("apps.common.apps", { defaultValue: "Apps" }), href: "/apps" },
      { label: t("apps.connect.title", { defaultValue: "Connect an app" }) },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, selectedCompany?.name, t]);

  const galleryQuery = useQuery({
    queryKey: queryKeys.apps.gallery(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listGallery(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (!appKey || galleryQuery.isLoading || !galleryQuery.data) return;

    const requestedEntry = galleryQuery.data.apps.find((candidate) => candidate.key === appKey);
    if (!requestedEntry || requestedEntry.authKind === "oauth" || requestedEntry.availability?.available === false) {
      setEntry(null);
      setStep("gallery");
      navigate("/apps/connect", { replace: true });
      return;
    }

    if (entry?.key !== requestedEntry.key) {
      setEntry(requestedEntry);
      setGalleryName(requestedEntry.name);
      setLinkUrl("");
      setLinkName("");
      setLinkNeedsKey(false);
      setLinkKey("");
      setCredentials({});
      setGoogleSheetsLinks("");
      setGoogleSheetsError(null);
      setConnectResult(null);
    }
    setInstallMode("none");
    setInstallAgentIds(new Set());
    setStep("key");
  }, [appKey, entry?.key, galleryQuery.data, galleryQuery.isLoading, navigate]);

  const setAppStep = (nextStep: Step) => {
    setStep(nextStep);
    if (entry) navigate(appConnectHref(entry.key, nextStep));
  };

  const connectMutation = useMutation({
    mutationFn: () => {
      if (entry) {
        const sheetIds = isGoogleSheetsEntry(entry) ? parseGoogleSheetIds(googleSheetsLinks).ids : [];
        const trimmedGalleryName = galleryName.trim();
        return toolsApi.connectApp(selectedCompanyId!, {
          galleryKey: entry.key,
          name: trimmedGalleryName || undefined,
          credentialValues: credentials,
          configValues: isGoogleSheetsEntry(entry) ? { allowedSpreadsheetIds: sheetIds } : undefined,
          applicationId: prefill.applicationId,
        });
      }
      const trimmedKey = linkNeedsKey ? linkKey.trim() : "";
      const trimmedName = linkName.trim();
      return toolsApi.connectApp(selectedCompanyId!, {
        link: linkUrl,
        name: trimmedName || undefined,
        credentialValues: trimmedKey ? { [LINK_CREDENTIAL_CONFIG_PATH]: trimmedKey } : undefined,
        applicationId: prefill.applicationId,
      });
    },
    onSuccess: (result) => {
      setConnectResult(result);
      const defaults: Record<string, boolean> = {};
      for (const a of result.actions.readOnly) defaults[a.catalogEntryId] = true;
      for (const a of result.actions.canMakeChanges) defaults[a.catalogEntryId] = false;
      setEnabled(defaults);
      setInstallMode("none");
      setInstallAgentIds(new Set());
      setAppStep("actions");
    },
    onError: (error) => {
      const details = error instanceof ApiError && error.body && typeof error.body === "object"
        ? (error.body as { details?: { code?: unknown } }).details
        : null;
      const oauthRequired = details?.code === "oauth_challenge";
      pushToast({
        title: oauthRequired
          ? t("apps.connect.signInRequired", { defaultValue: "Sign-in required" })
          : t("apps.connect.connectError", { defaultValue: "Couldn’t connect" }),
        body: oauthRequired
          ? t("apps.connect.signInComingSoon", { defaultValue: "This app needs you to sign in - coming soon." })
          : error instanceof Error
            ? error.message
            : t("apps.connect.checkKey", { defaultValue: "Please check your key and try again." }),
        tone: "error",
      });
    },
  });

  const finishMutation = useMutation({
    mutationFn: async () => {
      const askFirstLevels = connectResult ? askFirstLevelsFrom(connectResult) : [];
      const changeActions = connectResult?.actions.canMakeChanges ?? [];
      const enabledIds = Object.entries(enabled)
        .filter(([, on]) => on)
        .map(([id]) => id);
      const askFirstIds = changeActions
        .filter((a) => enabled[a.catalogEntryId] && askFirstLevels.includes(a.riskLevel))
        .map((a) => a.catalogEntryId);
      const selection: AppAccessSelection =
        access === "all" ? "all_agents" : { agentIds: Array.from(agentIds) };
      const result = await toolsApi.finishApp(selectedCompanyId!, connectResult!.connectionId, {
        enabledCatalogEntryIds: enabledIds,
        askFirstCatalogEntryIds: askFirstIds,
        access: selection,
      });
      const installState = installMode === "all"
        ? { onAll: true, agentIds: new Set<string>() }
        : { onAll: false, agentIds: installMode === "specific" ? installAgentIds : new Set<string>() };
      await toolsApi.putConnectionInstalls(
        connectResult!.connectionId,
        installPayload(selectedCompanyId!, installState),
      );
      return result;
    },
    onSuccess: () => setAppStep("success"),
    onError: (error) => {
      pushToast({
        title: t("apps.connect.finishError", { defaultValue: "Couldn’t finish setup" }),
        body: error instanceof Error
          ? error.message
          : t("apps.common.tryAgain", { defaultValue: "Please try again." }),
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("apps.connect.selectCompany", { defaultValue: "Select a company to connect apps." })}
      </div>
    );
  }

  const appName =
    connectResult?.application.name ??
    entry?.name ??
    (linkName.trim() || defaultLinkName(linkUrl) || t("apps.connect.thisApp", { defaultValue: "this app" }));
  const zapierEntry = zapierSource
    ? galleryQuery.data?.apps.find((app) => app.key === "zapier") ?? null
    : null;
  const defaultStepLabels = zapierSource
    ? ZAPIER_STEP_LABELS
    : isGoogleSheetsEntry(entry)
      ? ["Pick app", "Share sheet", "Choose actions", "Choose access", "Install tools"]
      : STEP_LABELS;
  const stepLabels = defaultStepLabels.map((label) =>
    t(STEP_LABEL_KEYS[label] ?? "apps.connect.steps.unknown", { defaultValue: label }),
  );
  const stepIndex = zapierSource && step !== "gallery" && step !== "success"
    ? ZAPIER_STEP_INDEX[step]
    : step === "success"
      ? stepLabels.length
      : STEP_INDEX[step];

  return (
    <div className="max-w-5xl">
      {step !== "success" && (
        <StepHeader
          subtitle={
            step === "gallery"
              ? t("apps.connect.pickDescription", { defaultValue: "Pick the app you want your agents to use." })
              : t("apps.connect.stepProgress", {
                  defaultValue: "Step {{current}} of {{total}}",
                  current: stepIndex + 1,
                  total: stepLabels.length,
                })
          }
          step={step}
          activeIndex={stepIndex}
          labels={stepLabels}
          appIdentity={
            zapierSource
              ? { name: "Zapier", logoUrl: zapierEntry?.logoUrl ?? null }
              : undefined
          }
          onCancel={() => navigate(zapierSource ? "/apps/browse" : "/apps")}
        />
      )}

      {step === "gallery" && (
        <GalleryStep
          loading={galleryQuery.isLoading}
          apps={galleryQuery.data?.apps ?? []}
          byo={searchParams.get("byo") === "1"}
          source={searchParams.get("source")}
          onPick={(picked) => {
            setEntry(picked);
            setGalleryName(picked.name);
            setLinkUrl("");
            setLinkName("");
            setLinkNeedsKey(false);
            setLinkKey("");
            setCredentials({});
            setGoogleSheetsLinks("");
            setGoogleSheetsError(null);
            setConnectResult(null);
            setInstallMode("none");
            setInstallAgentIds(new Set());
            setStep("key");
            navigate(appConnectHref(picked.key, "key"));
          }}
          onUseLink={(url) => {
            const matchedEntry = getToolAppGalleryEntryForUrl(url, galleryQuery.data?.apps ?? []);
            setEntry(null);
            setGalleryName("");
            setLinkUrl(url);
            setLinkName(matchedEntry?.name ?? defaultLinkName(url) ?? "");
            setLinkNeedsKey(false);
            setLinkKey("");
            setCredentials({});
            setGoogleSheetsLinks("");
            setGoogleSheetsError(null);
            setInstallMode("none");
            setInstallAgentIds(new Set());
            setStep("key");
          }}
          onRunYourOwn={() => navigate(advancedTabHref("run-your-own"))}
          onPasteConfig={() => navigate(advancedTabHref("paste-config"))}
        />
      )}

      {step === "key" && entry && (
        <KeyStep
          entry={entry}
          name={galleryName}
          onNameChange={setGalleryName}
          values={credentials}
          onChange={setCredentials}
          googleSheetsLinks={googleSheetsLinks}
          googleSheetsError={googleSheetsError}
          onGoogleSheetsLinksChange={(next) => {
            setGoogleSheetsLinks(next);
            setGoogleSheetsError(null);
          }}
          submitting={connectMutation.isPending}
          onBack={openGallery}
          onConnect={() => {
            if (isGoogleSheetsEntry(entry)) {
              const parsed = parseGoogleSheetIds(googleSheetsLinks);
              if (parsed.invalidCount > 0) {
                setGoogleSheetsError(t("apps.connect.googleSheets.invalidLink", {
                  defaultValue: "That doesn't look like a Google Sheets link.",
                }));
                return;
              }
              if (parsed.ids.length === 0) {
                setGoogleSheetsError(t("apps.connect.googleSheets.missingLink", {
                  defaultValue: "Paste at least one Google Sheets link.",
                }));
                return;
              }
            }
            connectMutation.mutate();
          }}
        />
      )}

      {step === "key" && !entry && linkUrl && !zapierSource && (
        <LinkConnectStep
          link={linkUrl}
          name={linkName}
          onNameChange={setLinkName}
          needsKey={linkNeedsKey}
          onNeedsKeyChange={(next) => {
            setLinkNeedsKey(next);
            if (!next) setLinkKey("");
          }}
          keyValue={linkKey}
          onKeyChange={setLinkKey}
          submitting={connectMutation.isPending}
          onBack={() => setStep("gallery")}
          onConnect={() => connectMutation.mutate()}
        />
      )}

      {step === "key" && !entry && zapierSource && (
        <ZapierConnectStep
          link={linkUrl}
          onLinkChange={setLinkUrl}
          submitting={connectMutation.isPending}
          onBack={() => navigate("/apps/browse")}
          onConnect={() => connectMutation.mutate()}
        />
      )}

      {step === "actions" && connectResult && (
        <ActionsStep
          appName={appName}
          result={connectResult}
          enabled={enabled}
          onToggle={(id, on) => setEnabled((prev) => ({ ...prev, [id]: on }))}
          onBulk={(ids, on) =>
            setEnabled((prev) => {
              const next = { ...prev };
              for (const id of ids) next[id] = on;
              return next;
            })
          }
          onBack={() => setAppStep("key")}
          onContinue={() => setAppStep("who")}
        />
      )}

      {step === "who" && connectResult && (
        <WhoStep
          appName={appName}
          companyId={selectedCompanyId}
          access={access}
          setAccess={setAccess}
          agentIds={agentIds}
          setAgentIds={setAgentIds}
          onBack={() => setAppStep("actions")}
          onContinue={() => setAppStep("install")}
        />
      )}

      {step === "install" && connectResult && (
        <InstallStep
          appName={appName}
          companyId={selectedCompanyId}
          access={access}
          accessAgentIds={agentIds}
          installMode={installMode}
          setInstallMode={setInstallMode}
          installAgentIds={installAgentIds}
          setInstallAgentIds={setInstallAgentIds}
          submitting={finishMutation.isPending}
          onBack={() => setAppStep("who")}
          onFinish={() => finishMutation.mutate()}
        />
      )}

      {step === "success" && (
        <SuccessStep
          appName={appName}
          logoUrl={entry?.logoUrl}
          enabledCount={Object.values(enabled).filter(Boolean).length}
          access={access}
          installMode={installMode}
          installCount={installAgentIds.size}
          onDone={() => navigate("/apps")}
        />
      )}
    </div>
  );
}

function StepHeader({
  subtitle,
  step,
  activeIndex,
  labels,
  appIdentity,
  onCancel,
}: {
  subtitle: string;
  step: Step;
  activeIndex: number;
  labels: string[];
  appIdentity?: { name: string; logoUrl: string | null };
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {appIdentity ? (
            <AppLogo name={appIdentity.name} logoUrl={appIdentity.logoUrl} size={44} />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {appIdentity
                ? t("apps.connect.connectNamedApp", {
                    defaultValue: "Connect {{appName}}",
                    appName: appIdentity.name,
                  })
                : t("apps.connect.title", { defaultValue: "Connect an app" })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("apps.common.cancel", { defaultValue: "Cancel" })}
        </Button>
      </div>
      {step !== "gallery" && (
        <div className="mt-4">
          <div className="flex gap-2">
            {labels.map((label, i) => (
              <div
                key={label}
                className={cn("h-1 w-20 rounded-full", i <= activeIndex ? "bg-foreground" : "bg-border")}
              />
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{labels.join("   ·   ")}</div>
        </div>
      )}
    </div>
  );
}

function ZapierConnectStep({
  link,
  onLinkChange,
  submitting,
  onBack,
  onConnect,
}: {
  link: string;
  onLinkChange: (next: string) => void;
  submitting: boolean;
  onBack: () => void;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  const normalizedLink = normalizeAppLink(link);
  const zapierHostname = normalizedLink ? new URL(normalizedLink).hostname : "";
  const isZapierLink = zapierHostname === "zapier.com" || zapierHostname.endsWith(".zapier.com");

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8">
      <div className="flex items-start gap-3">
        <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <Link2 className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">
            {t("apps.connect.connectZapier", { defaultValue: "Connect Zapier" })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("apps.connect.zapierDescription", {
              defaultValue: "Paste the complete MCP URL Zapier gives you, including its token.",
            })}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <label className="text-sm font-medium text-foreground">
          {t("apps.connect.zapierUrl", { defaultValue: "Zapier MCP URL" })}
        </label>
        <Input
          value={link}
          onChange={(event) => onLinkChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && isZapierLink && !submitting) onConnect();
          }}
          placeholder="https://mcp.zapier.com/api/v1/connect?token=…"
          className="mt-2 h-11"
          autoFocus
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {t("apps.connect.zapierTokenNotice", {
            defaultValue: "The token is part of the URL. Paperclip stores it securely and checks the connection before enabling actions.",
          })}
        </p>
        {link.trim() && !isZapierLink && (
          <p className="mt-2 text-xs text-destructive">
            {t("apps.connect.zapierInvalidUrl", { defaultValue: "Paste a valid Zapier URL to continue." })}
          </p>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          {t("apps.common.back", { defaultValue: "Back" })}
        </Button>
        <Button onClick={onConnect} disabled={submitting || !isZapierLink}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitting
            ? t("apps.connect.checking", { defaultValue: "Checking…" })
            : t("apps.connect.checkLink", { defaultValue: "Check link" })}
        </Button>
      </div>
    </div>
  );
}

function GalleryStep({
  loading,
  apps,
  byo = false,
  source = null,
  onPick,
  onUseLink,
  onRunYourOwn,
  onPasteConfig,
}: {
  loading: boolean;
  apps: AppGalleryEntry[];
  /** Entered via the "Connect your own MCP server" card (PAP-12371, Finding C): focus the link path. */
  byo?: boolean;
  source?: string | null;
  onPick: (entry: AppGalleryEntry) => void;
  onUseLink: (link: string) => void;
  onRunYourOwn: () => void;
  onPasteConfig: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkSectionRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Arriving from the BYO card: scroll the "Connect with a link" section into
  // view and focus its input so the paste-URL path is the obvious next step.
  useEffect(() => {
    if (!byo || loading) return;
    linkSectionRef.current?.scrollIntoView({ block: "center" });
    linkInputRef.current?.focus();
  }, [byo, loading]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) => a.name.toLowerCase().includes(q));
  }, [apps, search]);
  const normalizedLink = normalizeAppLink(linkInput);
  const matchedEntry = normalizedLink ? getToolAppGalleryEntryForUrl(normalizedLink, apps) : null;
  const zapierSource = source === "zapier";

  const continueWithLink = () => {
    const next = normalizeAppLink(linkInput);
    if (!next) {
      setLinkError(t("apps.connect.link.fullUrlError", { defaultValue: "Paste a full http or https link." }));
      return;
    }
    setLinkError(null);
    onUseLink(next);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("apps.browse.searchPlaceholder", { defaultValue: "Search apps…" })}
          className="h-11 pl-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((app) => {
          const copy = appCopyFor(app.key, app.tagline);
          const oauth = app.authKind === "oauth";
          const unavailable = app.availability?.available === false;
          return (
            <button
              key={app.key}
              type="button"
              disabled={oauth || unavailable}
              title={
                unavailable
                  ? t("apps.connect.gallery.notConfiguredTitle", {
                      defaultValue: "{{appName}} isn't configured on this instance yet. Ask your Paperclip admin.",
                      appName: app.name,
                    })
                  : undefined
              }
              onClick={() => onPick(app)}
              className={cn(
                "flex flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors",
                oauth || unavailable ? "cursor-not-allowed opacity-60" : "hover:border-foreground/30 hover:bg-accent/40",
              )}
            >
              <AppLogo name={app.name} logoUrl={app.logoUrl} size={36} />
              <div className="mt-3 text-sm font-bold text-foreground">{app.name}</div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {t(`apps.gallery.${app.key}.tagline`, { defaultValue: copy.tagline })}
              </div>
              <div className="mt-3 text-xs font-semibold text-foreground">
                {unavailable ? (
                  <span className="text-muted-foreground">
                    {t("apps.connect.gallery.notAvailableOnInstance", {
                      defaultValue: "Not available on this instance - ask your admin.",
                    })}
                  </span>
                ) : oauth ? (
                  <span className="text-muted-foreground">
                    {t("apps.connect.gallery.signInComingSoon", { defaultValue: "Sign-in coming soon" })}
                  </span>
                ) : (
                  <span>{t("apps.common.connectArrow", { defaultValue: "Connect →" })}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t("apps.connect.gallery.noMatches", { defaultValue: "No apps match “{{query}}”.", query: search })}
        </div>
      )}

      <div
        ref={linkSectionRef}
        className={cn(
          "grid gap-4 border-t border-border pt-5 md:grid-cols-(--gtc-13)",
          byo && "-mx-3 rounded-xl border border-primary/40 bg-primary/[0.04] px-3 pb-4 md:mx-0",
        )}
      >
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            {zapierSource
              ? t("apps.connect.connectZapier", { defaultValue: "Connect Zapier" })
              : byo
                ? t("apps.connect.link.connectOwnServer", { defaultValue: "Connect your own MCP server" })
                : t("apps.connect.link.title", { defaultValue: "Connect with a link" })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {zapierSource
              ? t("apps.connect.zapierDescription", {
                  defaultValue: "Paste the complete MCP URL Zapier gives you, including its token.",
                })
              : byo
                ? t("apps.connect.link.ownServerDescription", {
                    defaultValue: "Paste your MCP server’s URL and we’ll walk you through permissions and review.",
                  })
                : t("apps.connect.link.description", {
                    defaultValue: "Paste a setup link from an app that is not listed here.",
                  })}
          </p>
          {!zapierSource && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("apps.connect.link.remoteUrlNotice", {
                defaultValue: "Any remote tool URL works here — including a local MCP server like",
              })}{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">http://127.0.0.1:8848/mcp</code>.
            </p>
          )}
          {matchedEntry && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <AppLogo name={matchedEntry.name} logoUrl={matchedEntry.logoUrl} size={24} />
                <span className="truncate">
                  {t("apps.connect.link.matchedApp", {
                    defaultValue: "This looks like {{appName}}.",
                    appName: matchedEntry.name,
                  })}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={matchedEntry.availability?.available === false}
                onClick={() => {
                  setLinkError(null);
                  if (matchedEntry.key === "zapier") {
                    continueWithLink();
                    return;
                  }
                  onPick(matchedEntry);
                }}
              >
                {matchedEntry.availability?.available === false
                  ? t("apps.common.notAvailable", { defaultValue: "Not available" })
                  : matchedEntry.key === "zapier"
                    ? t("apps.common.continue", { defaultValue: "Continue" })
                    : t("apps.connect.link.useApp", {
                        defaultValue: "Use {{appName}}",
                        appName: matchedEntry.name,
                      })}
              </Button>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:min-w-(--sz-360px)">
          <div className="flex gap-2">
            <Input
              ref={linkInputRef}
              value={linkInput}
              onChange={(e) => {
                setLinkInput(e.target.value);
                setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") continueWithLink();
              }}
              placeholder={zapierSource ? "https://mcp.zapier.com/api/v1/connect?token=…" : "https://example.com/actions"}
              className="h-10"
            />
            <Button type="button" variant="outline" onClick={continueWithLink}>
              {t("apps.common.continue", { defaultValue: "Continue" })}
            </Button>
          </div>
          {linkError && <div className="text-xs text-destructive">{linkError}</div>}
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <div className="text-sm font-semibold text-foreground">
          {t("apps.connect.moreWays.title", { defaultValue: "More ways to connect" })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("apps.connect.moreWays.description", {
            defaultValue: "For tools that aren’t in the gallery. You’ll need details from the tool’s docs.",
          })}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <ConnectMethodRow
            icon={TerminalSquare}
            title={t("apps.connect.moreWays.runOwn", { defaultValue: "Run your own" })}
            description={t("apps.connect.moreWays.runOwnDescription", {
              defaultValue: "Register a command Paperclip runs in your workspace for a tool that isn’t listed.",
            })}
            onClick={onRunYourOwn}
          />
          <ConnectMethodRow
            icon={ClipboardPaste}
            title={t("apps.connect.moreWays.pasteConfig", { defaultValue: "Paste a config" })}
            description={t("apps.connect.moreWays.pasteConfigDescription", {
              defaultValue: "Already have a setup snippet from a README? Paste it and we’ll connect it.",
            })}
            onClick={onPasteConfig}
          />
        </div>
      </div>
    </div>
  );
}

function ConnectMethodRow({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{description}</div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function normalizeAppLink(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function defaultLinkName(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function LinkConnectStep({
  link,
  name,
  onNameChange,
  needsKey,
  onNeedsKeyChange,
  keyValue,
  onKeyChange,
  submitting,
  onBack,
  onConnect,
}: {
  link: string;
  name: string;
  onNameChange: (next: string) => void;
  needsKey: boolean;
  onNeedsKeyChange: (next: boolean) => void;
  keyValue: string;
  onKeyChange: (next: string) => void;
  submitting: boolean;
  onBack: () => void;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8">
      <div className="flex items-start gap-3">
        <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <Link2 className="h-5 w-5 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">
            {t("apps.connect.link.title", { defaultValue: "Connect with a link" })}
          </h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{link}</p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t("apps.common.name", { defaultValue: "Name" })}
          </label>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t("apps.connect.namePlaceholder", { defaultValue: "My app" })}
            className="mt-2 h-11"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("apps.connect.link.nameDescription", {
              defaultValue: "We filled this in from the link. Change it if you’d like.",
            })}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">
            {t("apps.connect.link.needsKey", { defaultValue: "Does it need a key?" })}
          </label>
          <div className="mt-2 inline-flex rounded-lg border border-border bg-muted/50 p-1">
            <SegmentedOption
              label={t("apps.common.no", { defaultValue: "No" })}
              selected={!needsKey}
              onClick={() => onNeedsKeyChange(false)}
            />
            <SegmentedOption
              label={t("apps.common.yes", { defaultValue: "Yes" })}
              selected={needsKey}
              onClick={() => onNeedsKeyChange(true)}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {needsKey
              ? t("apps.connect.link.pasteKey", { defaultValue: "Paste the key this app gave you." })
              : t("apps.connect.link.keyHint", {
                  defaultValue: "Most apps just work from the link — pick Yes only if the app gave you a key.",
                })}
          </p>
        </div>

        {needsKey && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                {t("apps.connect.appKey", { defaultValue: "App key" })}
              </label>
              <Input
                type="password"
                autoComplete="off"
                value={keyValue}
                onChange={(e) => onKeyChange(e.target.value)}
                placeholder="••••••••••••••••"
                className="mt-2 h-11 font-mono"
              />
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium text-foreground">
                  {t("apps.connect.keyStored", { defaultValue: "Your key is stored securely." })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("apps.connect.replaceKey", {
                    defaultValue: "You can replace it anytime from this app’s page.",
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          {t("apps.common.back", { defaultValue: "Back" })}
        </Button>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t("apps.connect.link.checkNotice", {
              defaultValue: "We’ll check the link before turning anything on.",
            })}
          </span>
          <Button onClick={onConnect} disabled={submitting || (needsKey && keyValue.trim().length === 0)}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting
              ? t("apps.connect.checking", { defaultValue: "Checking…" })
              : t("apps.connect.checkLink", { defaultValue: "Check link" })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SegmentedOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "min-w-(--sz-64px) rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
        selected
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ConnectionNameField({
  name,
  onNameChange,
}: {
  name: string;
  onNameChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="text-sm font-medium text-foreground">
        {t("apps.common.name", { defaultValue: "Name" })}
      </label>
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={t("apps.connect.namePlaceholder", { defaultValue: "My app" })}
        className="mt-2 h-11"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {t("apps.connect.nameDescription", {
          defaultValue: "We filled this in from the app. Change it to tell connections apart.",
        })}
      </p>
    </div>
  );
}

function KeyStep({
  entry,
  name,
  onNameChange,
  values,
  onChange,
  googleSheetsLinks,
  googleSheetsError,
  onGoogleSheetsLinksChange,
  submitting,
  onBack,
  onConnect,
}: {
  entry: AppGalleryEntry;
  name: string;
  onNameChange: (next: string) => void;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  googleSheetsLinks: string;
  googleSheetsError: string | null;
  onGoogleSheetsLinksChange: (next: string) => void;
  submitting: boolean;
  onBack: () => void;
  onConnect: () => void;
}) {
  const { t } = useTranslation();
  const copy = appCopyFor(entry.key, entry.tagline);
  const fields = entry.credentialFields ?? [];
  const allFilled = fields.every(
    (f) => f.required === false || (values[f.configPath]?.trim().length ?? 0) > 0,
  );
  const robotEmail = entry.availability?.robotEmail ?? null;
  const unavailable = entry.availability?.available === false;

  if (isGoogleSheetsEntry(entry)) {
    const parsed = parseGoogleSheetIds(googleSheetsLinks);
    const canConnect = !unavailable && Boolean(robotEmail) && googleSheetsLinks.trim().length > 0;
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-3">
          <AppLogo name={entry.name} logoUrl={entry.logoUrl} size={48} />
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              {t("apps.connect.googleSheets.title", { defaultValue: "Connect Google Sheets" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(`apps.gallery.${entry.key}.short`, { defaultValue: copy.short })}
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <ConnectionNameField name={name} onNameChange={onNameChange} />

          {robotEmail ? (
            <div>
              <label className="text-sm font-medium text-foreground">
                {t("apps.connect.googleSheets.shareEmail", { defaultValue: "Share each sheet with this email" })}
              </label>
              <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
                <div
                  title={robotEmail}
                  className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-muted/40 px-3 py-2.5 font-mono text-xs leading-tight text-foreground break-all"
                >
                  {robotEmail}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void navigator.clipboard?.writeText(robotEmail)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {t("apps.common.copy", { defaultValue: "Copy" })}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("apps.connect.googleSheets.shareInstructions", {
                  defaultValue: "In Google Sheets, click Share and add this email as an Editor. Then paste the sheet links below.",
                })}
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
              {t("apps.connect.googleSheets.unavailable", {
                defaultValue: "Google Sheets is not available on this instance yet.",
              })}
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-foreground">
              {t("apps.connect.googleSheets.pasteLinks", { defaultValue: "Paste links to the sheets you shared" })}
            </label>
            <Textarea
              value={googleSheetsLinks}
              onChange={(e) => onGoogleSheetsLinksChange(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="mt-2 min-h-28"
            />
            <div className="mt-2 text-xs text-muted-foreground">
              {parsed.ids.length > 0
                ? t("apps.connect.googleSheets.readyCount", {
                    defaultValue: parsed.ids.length === 1
                      ? "{{count}} sheet ready to connect."
                      : "{{count}} sheets ready to connect.",
                    count: parsed.ids.length,
                  })
                : t("apps.connect.googleSheets.linkHint", {
                    defaultValue: "Paste one link per line. Both .../edit and .../edit#gid=... links work.",
                  })}
            </div>
            {googleSheetsError && <div className="mt-2 text-xs text-destructive">{googleSheetsError}</div>}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} disabled={submitting}>
            {t("apps.common.back", { defaultValue: "Back" })}
          </Button>
          <Button onClick={onConnect} disabled={submitting || !canConnect}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting
              ? t("apps.connect.checking", { defaultValue: "Checking…" })
              : t("apps.common.connect", { defaultValue: "Connect" })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8">
      <div className="flex items-center gap-3">
        <AppLogo name={entry.name} logoUrl={entry.logoUrl} size={48} />
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {t("apps.connect.connectNamedApp", {
              defaultValue: "Connect {{appName}}",
              appName: entry.name,
            })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(`apps.gallery.${entry.key}.short`, { defaultValue: copy.short })}
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <ConnectionNameField name={name} onNameChange={onNameChange} />

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("apps.connect.noKeyRequired", {
              defaultValue: "This app doesn’t need a key. Just connect to continue.",
            })}
          </p>
        ) : (
          fields.map((field) => (
            <div key={field.configPath}>
              <label className="text-sm font-medium text-foreground">
                {t(`apps.gallery.${entry.key}.credentials.${field.configPath.replaceAll(".", "_")}`, {
                  defaultValue: credentialFieldLabel(entry.name, field.label, fields.length),
                })}
              </label>
              <Input
                type="password"
                autoComplete="off"
                value={values[field.configPath] ?? ""}
                onChange={(e) => onChange({ ...values, [field.configPath]: e.target.value })}
                placeholder="••••••••••••••••"
                className="mt-2 h-11 font-mono"
              />
              {field.helpUrl && (
                <a
                  href={field.helpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-foreground underline underline-offset-2"
                >
                  {t("apps.connect.findCredential", { defaultValue: "Where do I find this?" })}
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              )}
            </div>
          ))
        )}

        <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium text-foreground">
              {t("apps.connect.keyStored", { defaultValue: "Your key is stored securely." })}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("apps.connect.replaceKey", {
                defaultValue: "You can replace it anytime from this app’s page.",
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          {t("apps.common.back", { defaultValue: "Back" })}
        </Button>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t("apps.connect.checkKeyNotice", {
              defaultValue: "We’ll check the key before turning anything on.",
            })}
          </span>
          <Button onClick={onConnect} disabled={submitting || !allFilled}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting
              ? t("apps.connect.checking", { defaultValue: "Checking…" })
              : t("apps.common.connect", { defaultValue: "Connect" })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActionGroup({
  title,
  hint,
  actions,
  enabled,
  onToggle,
  bulkLabel,
  onBulk,
  askFirstLevels,
}: {
  title: string;
  hint: string;
  actions: ToolAppConnectionActionSummary[];
  enabled: Record<string, boolean>;
  onToggle: (id: string, on: boolean) => void;
  bulkLabel: string;
  onBulk: () => void;
  askFirstLevels: string[];
}) {
  const { t } = useTranslation();
  if (actions.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="text-sm">
          <span className="font-bold text-foreground">{title}</span>
          <span className="ml-2 text-muted-foreground">· {hint}</span>
        </div>
        <button
          type="button"
          onClick={onBulk}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {bulkLabel}
        </button>
      </div>
      <div className="divide-y divide-border">
        {actions.map((action) => {
          const on = enabled[action.catalogEntryId] ?? false;
          const showAskFirst = on && askFirstLevels.includes(action.riskLevel);
          return (
            <div key={action.catalogEntryId} className="flex items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {action.title ?? action.toolName}
                </div>
                {action.description && (
                  <div className="truncate text-xs text-muted-foreground">{action.description}</div>
                )}
              </div>
              {showAskFirst && (
                <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {t("apps.connect.actions.askFirst", { defaultValue: "Ask first" })}
                </span>
              )}
              <ToggleSwitch
                checked={on}
                onCheckedChange={(next) => onToggle(action.catalogEntryId, next)}
                aria-label={t("apps.connect.actions.toggleAction", {
                  defaultValue: "Toggle {{action}}",
                  action: action.title ?? action.toolName,
                })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionsStep({
  appName,
  result,
  enabled,
  onToggle,
  onBulk,
  onBack,
  onContinue,
}: {
  appName: string;
  result: ConnectToolAppResult;
  enabled: Record<string, boolean>;
  onToggle: (id: string, on: boolean) => void;
  onBulk: (ids: string[], on: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const askFirstLevels = askFirstLevelsFrom(result);
  const { readOnly, canMakeChanges } = result.actions;
  const total = readOnly.length + canMakeChanges.length;
  const enabledCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" />
        </span>
        <div>
          <div className="text-lg font-bold text-foreground">
            {t("apps.connect.actions.connected", {
              defaultValue: total === 1
                ? "Connected to {{appName}} — it offers {{count}} action."
                : "Connected to {{appName}} — it offers {{count}} actions.",
              appName,
              count: total,
            })}
          </div>
          <div className="text-sm text-muted-foreground">
            {t("apps.connect.actions.description", {
              defaultValue: "Read-only actions are on. Anything that can change something starts off — turn on the ones you want.",
            })}
          </div>
        </div>
      </div>

      <ActionGroup
        title={t("apps.connect.actions.readOnly", { defaultValue: "Read only" })}
        hint={t("apps.connect.actions.readOnlyHint", { defaultValue: "these can look but not change anything" })}
        actions={readOnly}
        enabled={enabled}
        onToggle={onToggle}
        bulkLabel={t("apps.connect.actions.turnAllOff", { defaultValue: "Turn all off" })}
        onBulk={() => onBulk(readOnly.map((a) => a.catalogEntryId), false)}
        askFirstLevels={askFirstLevels}
      />

      <ActionGroup
        title={t("apps.connect.actions.canMakeChanges", { defaultValue: "Can make changes" })}
        hint={t("apps.connect.actions.canMakeChangesHint", {
          defaultValue: "these change something in another app",
        })}
        actions={canMakeChanges}
        enabled={enabled}
        onToggle={onToggle}
        bulkLabel={t("apps.connect.actions.turnAllOn", { defaultValue: "Turn all on" })}
        onBulk={() => onBulk(canMakeChanges.map((a) => a.catalogEntryId), true)}
        askFirstLevels={askFirstLevels}
      />

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" onClick={onBack}>
          {t("apps.common.back", { defaultValue: "Back" })}
        </Button>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t("apps.connect.actions.newActionsNotice", {
              defaultValue: "If {{appName}} adds new actions later, they start off until you review them.",
              appName,
            })}
          </span>
          <Button onClick={onContinue} disabled={enabledCount === 0}>
            {t("apps.connect.actions.continueCount", {
              defaultValue: enabledCount === 1
                ? "Continue with {{count}} action on"
                : "Continue with {{count}} actions on",
              count: enabledCount,
            })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function WhoStep({
  appName,
  companyId,
  access,
  setAccess,
  agentIds,
  setAgentIds,
  onBack,
  onContinue,
}: {
  appName: string;
  companyId: string;
  access: "all" | "specific";
  setAccess: (a: "all" | "specific") => void;
  agentIds: Set<string>;
  setAgentIds: (s: Set<string>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: access === "specific",
  });
  const agents: Agent[] = (agentsQuery.data ?? []).filter((a) => a.status !== "terminated");
  const canFinish = access === "all" || agentIds.size > 0;

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-border bg-card p-8">
        <h2 className="text-xl font-bold tracking-tight">
          {t("apps.connect.access.title", { defaultValue: "Who can use {{appName}}?", appName })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("apps.connect.access.description", {
            defaultValue: "You can change this later from the app’s page.",
          })}
        </p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => setAccess("all")}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
              access === "all" ? "border-foreground bg-muted/40" : "border-border hover:border-foreground/30",
            )}
          >
            <Radio selected={access === "all"} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">
                  {t("apps.common.allAgents", { defaultValue: "All agents" })}
                </span>
                <span className="rounded-full bg-foreground px-2 py-0.5 text-(length:--text-nano) font-bold text-background">
                  {t("apps.common.recommended", { defaultValue: "Recommended" })}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("apps.connect.access.allDescription", {
                  defaultValue: "Anyone you’ve added to Paperclip can use {{appName}} in their tasks. This is what most teams want.",
                  appName,
                })}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setAccess("specific")}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
              access === "specific" ? "border-foreground bg-muted/40" : "border-border hover:border-foreground/30",
            )}
          >
            <Radio selected={access === "specific"} />
            <div className="flex-1">
              <span className="font-semibold text-foreground">
                {t("apps.connect.access.specificAgents", { defaultValue: "Only specific agents" })}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("apps.connect.access.specificDescription", {
                  defaultValue: "Tick the agents who can use {{appName}}.",
                  appName,
                })}
              </p>
            </div>
          </button>

          {access === "specific" && (
            <AgentMultiSelect
              agents={agents}
              selectedAgentIds={agentIds}
              onChange={setAgentIds}
              loading={agentsQuery.isLoading}
              showSelectionPreview={false}
            />
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          {t("apps.common.back", { defaultValue: "Back" })}
        </Button>
        <Button onClick={onContinue} disabled={!canFinish}>
          {t("apps.connect.access.continue", { defaultValue: "Continue to install" })}
        </Button>
      </div>
    </div>
  );
}

export function InstallStep({
  appName,
  companyId,
  access,
  accessAgentIds,
  installMode,
  setInstallMode,
  installAgentIds,
  setInstallAgentIds,
  submitting,
  onBack,
  onFinish,
}: {
  appName: string;
  companyId: string;
  access: "all" | "specific";
  accessAgentIds: Set<string>;
  installMode: InstallMode;
  setInstallMode: (mode: InstallMode) => void;
  installAgentIds: Set<string>;
  setInstallAgentIds: (ids: Set<string>) => void;
  submitting: boolean;
  onBack: () => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
  });
  const agents: Agent[] = (agentsQuery.data ?? []).filter((a) => a.status !== "terminated");
  const installSpecific = () => {
    setInstallMode("specific");
    if (installAgentIds.size === 0 && access === "specific") setInstallAgentIds(new Set(accessAgentIds));
  };
  const extendingAgentIds = access === "all"
    ? []
    : installMode === "all"
      ? agents.filter((agent) => !accessAgentIds.has(agent.id)).map((agent) => agent.id)
      : [...installAgentIds].filter((id) => !accessAgentIds.has(id));
  const canFinish = installMode !== "specific" || installAgentIds.size > 0;
  const extendingLabel = extendingAgentIds.length === 1
    ? agents.find((agent) => agent.id === extendingAgentIds[0])?.name
      ?? t("apps.connect.install.agentCount", { defaultValue: "1 agent", count: 1 })
    : t("apps.connect.install.agentCount", {
        defaultValue: "{{count}} agents",
        count: extendingAgentIds.length,
      });

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-border bg-card p-8">
        <h2 className="text-xl font-bold tracking-tight">
          {t("apps.connect.install.title", { defaultValue: "Install {{appName}} tools?", appName })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("apps.connect.install.description", {
            defaultValue: "Access is permission. Install decides whose runs actually carry these tools.",
          })}
        </p>

        <div className="mt-5">
          <InlineBanner tone="info" compact>
            {t("apps.connect.install.infoNotice", {
              defaultValue: installInfoNotice(appName),
              appName,
            })}
          </InlineBanner>
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => setInstallMode("none")}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
              installMode === "none" ? "border-foreground bg-muted/40" : "border-border hover:border-foreground/30",
            )}
          >
            <Radio selected={installMode === "none"} />
            <div>
              <span className="font-semibold text-foreground">
                {t("apps.connect.install.notYet", { defaultValue: "Not yet" })}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("apps.connect.install.notYetDescription", {
                  defaultValue: "Keep {{appName}} permitted only. You can install it later from the app or agent page.",
                  appName,
                })}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={installSpecific}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
              installMode === "specific" ? "border-foreground bg-muted/40" : "border-border hover:border-foreground/30",
            )}
          >
            <Radio selected={installMode === "specific"} />
            <div className="flex-1">
              <span className="font-semibold text-foreground">
                {t("apps.connect.install.specificAgents", { defaultValue: "Specific agents" })}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("apps.connect.install.specificDescription", {
                  defaultValue: "Tick the agents that should load {{appName}} every run.",
                  appName,
                })}
              </p>
            </div>
          </button>

          {installMode === "specific" ? (
            <div className="ml-7 border-l border-border pl-4">
              <AgentMultiSelect
                agents={agents}
                selectedAgentIds={installAgentIds}
                onChange={setInstallAgentIds}
                loading={agentsQuery.isLoading}
                showSelectionPreview={false}
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setInstallMode("all")}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
              installMode === "all" ? "border-foreground bg-muted/40" : "border-border hover:border-foreground/30",
            )}
          >
            <Radio selected={installMode === "all"} />
            <div>
              <span className="font-semibold text-foreground">
                {t("apps.common.allAgents", { defaultValue: "All agents" })}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("apps.connect.install.allWarning", { defaultValue: INSTALL_ALL_WARNING })}
              </p>
            </div>
          </button>

          {extendingAgentIds.length > 0 ? (
            <InlineBanner tone="warning" compact>
              {t("apps.connect.install.extendNotice", {
                defaultValue: autoExtendNotice(extendingLabel),
                agents: extendingLabel,
              })}
            </InlineBanner>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          {t("apps.common.back", { defaultValue: "Back" })}
        </Button>
        <Button onClick={onFinish} disabled={submitting || !canFinish}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitting
            ? t("apps.connect.install.finishing", { defaultValue: "Finishing..." })
            : t("apps.connect.install.finish", { defaultValue: "Finish setup" })}
        </Button>
      </div>
    </div>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
        selected ? "border-foreground" : "border-muted-foreground/40",
      )}
    >
      {selected && <span className="h-2 w-2 rounded-full bg-foreground" />}
    </span>
  );
}

function SuccessStep({
  appName,
  logoUrl,
  enabledCount,
  access,
  installMode,
  installCount,
  onDone,
}: {
  appName: string;
  logoUrl?: string | null;
  enabledCount: number;
  access: "all" | "specific";
  installMode: InstallMode;
  installCount: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const installSummary = installMode === "all"
    ? t("apps.connect.success.installedAll", { defaultValue: "Installed on all agents" })
    : installMode === "specific"
      ? t("apps.connect.success.installedCount", {
          defaultValue: installCount === 1
            ? "{{count}} agent installed"
            : "{{count}} agents installed",
          count: installCount,
        })
      : t("apps.connect.success.permittedOnly", { defaultValue: "Permitted only" });
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500/10">
        <Check className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="mt-6 flex items-center justify-center gap-2">
        <AppLogo name={appName} logoUrl={logoUrl} size={28} />
        <h2 className="text-2xl font-bold tracking-tight">
          {t("apps.connect.success.ready", { defaultValue: "{{appName}} is ready.", appName })}
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {installMode === "none"
          ? t("apps.connect.success.installLater", {
              defaultValue: "Agents can use it after you install it on their Tools tab.",
            })
          : t("apps.connect.success.loadNextRun", {
              defaultValue: "Installed agents will load it on their next run.",
            })}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("apps.connect.success.summary", {
          defaultValue: enabledCount === 1
            ? "{{count}} action on · {{access}} · {{install}}"
            : "{{count}} actions on · {{access}} · {{install}}",
          count: enabledCount,
          access: access === "all"
            ? t("apps.connect.success.allAccess", { defaultValue: "All agents can use it" })
            : t("apps.connect.success.specificAccess", { defaultValue: "Specific agents can use it" }),
          install: installSummary,
        })}
      </p>
      <div className="mt-8">
        <Button size="lg" className="px-10" onClick={onDone}>
          {t("apps.common.done", { defaultValue: "Done" })}
        </Button>
      </div>
    </div>
  );
}
