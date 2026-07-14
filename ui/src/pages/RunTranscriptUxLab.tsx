// token-extraction: allowlisted — intentional one-off decoration (DECISION-SHEET.md B1
// user ruling). The bg-[...gradient...] / shadow-[...] literals in this demo/UX-lab page
// are deliberate one-off decoration, reverted from --gradient-extract-*/--shadow-extract-*
// tokens; the file is on the check-token-gates allowlist in ui/src/index.css.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TranscriptEntry } from "../adapters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "../lib/utils";
import { Identity } from "../components/Identity";
import { StatusBadge } from "../components/StatusBadge";
import type { TranscriptDensity, TranscriptMode } from "../components/transcript/RunTranscriptView";
import { runTranscriptFixtureEntries, runTranscriptFixtureMeta } from "../fixtures/runTranscriptFixtures";
import { ExternalLink, FlaskConical, LayoutPanelLeft, MonitorCog, PanelsTopLeft, RadioTower } from "lucide-react";

type SurfaceId = "detail" | "live" | "dashboard";

type SurfaceOption = {
  id: SurfaceId;
  label: string;
  eyebrow: string;
  description: string;
  icon: typeof LayoutPanelLeft;
};

function buildSurfaceOptions(
  t: ReturnType<typeof useTranslation>["t"],
): SurfaceOption[] {
  return [
    {
      id: "detail",
      label: t("Run Detail", { defaultValue: "Run Detail" }),
      eyebrow: t("Full transcript", { defaultValue: "Full transcript" }),
      description: t(
        "The long-form run page with the `Nice | Raw` toggle and the most inspectable transcript view.",
        {
          defaultValue:
            "The long-form run page with the `Nice | Raw` toggle and the most inspectable transcript view.",
        },
      ),
      icon: MonitorCog,
    },
    {
      id: "live",
      label: t("Issue Widget", { defaultValue: "Issue Widget" }),
      eyebrow: t("Live stream", { defaultValue: "Live stream" }),
      description: t(
        "The issue-detail live run widget, optimized for following an active run without leaving the task page.",
        {
          defaultValue:
            "The issue-detail live run widget, optimized for following an active run without leaving the task page.",
        },
      ),
      icon: RadioTower,
    },
    {
      id: "dashboard",
      label: t("Dashboard Card", { defaultValue: "Dashboard Card" }),
      eyebrow: t("Dense card", { defaultValue: "Dense card" }),
      description: t(
        "The active-agents dashboard card, tuned for compact scanning while keeping the same transcript language.",
        {
          defaultValue:
            "The active-agents dashboard card, tuned for compact scanning while keeping the same transcript language.",
        },
      ),
      icon: PanelsTopLeft,
    },
  ];
}

function previewEntries(surface: SurfaceId) {
  if (surface === "dashboard") {
    return runTranscriptFixtureEntries.slice(-9);
  }
  if (surface === "live") {
    return runTranscriptFixtureEntries.slice(-14);
  }
  return runTranscriptFixtureEntries;
}

function compactPreviewText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncatePreviewText(value: string, max: number) {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

function describeFixtureEntry(entry: TranscriptEntry, mode: TranscriptMode) {
  switch (entry.kind) {
    case "assistant":
    case "user":
    case "thinking":
    case "stderr":
    case "system":
    case "result":
      return {
        kind: entry.kind,
        summary: truncatePreviewText(
          compactPreviewText(entry.text),
          mode === "raw" ? 220 : 140,
        ),
      };
    case "tool_call": {
      const command = typeof entry.input === "object"
        && entry.input !== null
        && "command" in entry.input
        && typeof entry.input.command === "string"
        ? entry.input.command
        : entry.name;
      return {
        kind: entry.kind,
        summary: truncatePreviewText(compactPreviewText(command), 180),
      };
    }
    case "tool_result": {
      const sections = entry.content.split(/\r?\n\r?\n/);
      const body = compactPreviewText(sections[sections.length - 1] ?? entry.content);
      return {
        kind: entry.kind,
        summary: truncatePreviewText(body || compactPreviewText(entry.content), 180),
      };
    }
    case "init":
      return {
        kind: entry.kind,
        summary: truncatePreviewText(
          compactPreviewText(`${entry.model ?? "unknown"} ${entry.sessionId ?? ""}`),
          160,
        ),
      };
    default:
      return {
        kind: "entry",
        summary: truncatePreviewText(compactPreviewText(JSON.stringify(entry)), 180),
      };
  }
}

function FixturePreviewList({
  entries,
  mode,
  limit,
}: {
  entries: TranscriptEntry[];
  mode: TranscriptMode;
  limit: number;
}) {
  return (
    <div className="space-y-2" data-e2e-ignore-i18n="true">
      {entries.slice(0, limit).map((entry, index) => {
        const row = describeFixtureEntry(entry, mode);
        return (
          <div
            key={`${entry.kind}-${entry.ts}-${index}`}
            className="rounded-lg border border-border/60 bg-background/75 px-3 py-2"
          >
            <div className="text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
              {row.kind}
            </div>
            <div className="mt-1 text-sm leading-6 text-foreground/90">
              {row.summary || "…"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RunDetailPreview({
  mode,
  streaming,
  density,
  t,
}: {
  mode: TranscriptMode;
  streaming: boolean;
  density: TranscriptDensity;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-background/80 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="border-b border-border/60 bg-background/90 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="uppercase tracking-(--tracking-caps) text-(length:--text-nano)">
            {t("Run Detail", { defaultValue: "Run Detail" })}
          </Badge>
          <StatusBadge status={streaming ? "running" : "succeeded"} />
          <span className="text-xs text-muted-foreground">
            {formatDateTime(runTranscriptFixtureMeta.startedAt)}
          </span>
        </div>
        <div className="mt-2 text-sm font-medium">
          {t("Transcript ({{count}})", {
            count: runTranscriptFixtureEntries.length,
            defaultValue: "Transcript ({{count}})",
          })}
        </div>
      </div>
      <div
        className="max-h-(--sz-720px) overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(8,145,178,0.08),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.10),transparent_28%)] p-5"
      >
        <FixturePreviewList
          entries={runTranscriptFixtureEntries}
          mode={mode}
          limit={density === "compact" ? 8 : 12}
        />
      </div>
    </div>
  );
}

function LiveWidgetPreview({
  streaming,
  mode,
  density,
  t,
}: {
  streaming: boolean;
  mode: TranscriptMode;
  density: TranscriptDensity;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-cyan-500/25 bg-background/85 shadow-[0_20px_50px_rgba(6,182,212,0.10)]">
      <div className="border-b border-border/60 bg-cyan-500/[0.05] px-5 py-4">
        <div className="text-xs font-semibold uppercase tracking-(--tracking-caps) text-cyan-700 dark:text-cyan-300">
          {t("Live Runs", { defaultValue: "Live Runs" })}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t("Compact live transcript stream for the issue detail page.", {
            defaultValue: "Compact live transcript stream for the issue detail page.",
          })}
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Identity name={runTranscriptFixtureMeta.agentName} size="sm" />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-border/70 bg-background/70 py-1 font-mono">
                {runTranscriptFixtureMeta.sourceRunId.slice(0, 8)}
              </Badge>
              <StatusBadge status={streaming ? "running" : "succeeded"} />
              <span>{formatDateTime(runTranscriptFixtureMeta.startedAt)}</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-(length:--text-micro) text-muted-foreground">
            {t("Open run", { defaultValue: "Open run" })}
            <ExternalLink className="h-3 w-3" />
          </span>
        </div>
        <div className="max-h-(--sz-460px) overflow-y-auto pr-1">
          <FixturePreviewList
            entries={previewEntries("live")}
            mode={mode}
            limit={density === "compact" ? 8 : 10}
          />
        </div>
      </div>
    </div>
  );
}

function DashboardPreview({
  streaming,
  mode,
  density,
  t,
}: {
  streaming: boolean;
  mode: TranscriptMode;
  density: TranscriptDensity;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div className="max-w-md">
      <div className={cn(
        "flex h-(--sz-320px) flex-col overflow-hidden rounded-xl border shadow-[0_20px_40px_rgba(15,23,42,0.10)]",
        streaming
          ? "border-cyan-500/25 bg-cyan-500/[0.04]"
          : "border-border bg-background/75",
      )}>
        <div className="border-b border-border/60 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "inline-flex h-2.5 w-2.5 rounded-full",
                  streaming ? "bg-cyan-500 shadow-[0_0_0_6px_rgba(34,211,238,0.12)]" : "bg-muted-foreground/35",
                )} />
                <Identity name={runTranscriptFixtureMeta.agentName} size="sm" />
              </div>
              <div className="mt-2 text-(length:--text-micro) text-muted-foreground">
                {streaming
                  ? t("Live now", { defaultValue: "Live now" })
                  : t("Finished 2m ago", { defaultValue: "Finished 2m ago" })}
              </div>
            </div>
            <Badge variant="outline" className="[&>svg]:size-2.5 border-border/70 bg-background/70 py-1 text-(length:--text-nano) text-muted-foreground">
              <ExternalLink className="h-2.5 w-2.5" />
            </Badge>
          </div>
          <div
            className="mt-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-300"
            data-e2e-ignore-i18n="true"
          >
            {runTranscriptFixtureMeta.issueIdentifier} - {runTranscriptFixtureMeta.issueTitle}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <FixturePreviewList
            entries={previewEntries("dashboard")}
            mode={mode}
            limit={density === "compact" ? 5 : 7}
          />
        </div>
      </div>
    </div>
  );
}

export function RunTranscriptUxLab() {
  const { t } = useTranslation();
  const [selectedSurface, setSelectedSurface] = useState<SurfaceId>("dashboard");
  const [detailMode, setDetailMode] = useState<TranscriptMode>("raw");
  const [streaming, setStreaming] = useState(true);
  const [density, setDensity] = useState<TranscriptDensity>("comfortable");
  const surfaceOptions = buildSurfaceOptions(t);

  const selected = surfaceOptions.find((option) => option.id === selectedSurface) ?? surfaceOptions[0];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,rgba(8,145,178,0.08),transparent_28%),linear-gradient(180deg,rgba(245,158,11,0.08),transparent_40%),var(--background)] shadow-[0_28px_70px_rgba(15,23,42,0.10)]">
        <div className="grid gap-6 lg:grid-cols-(--gtc-19)">
          <aside className="border-b border-border/60 bg-background/75 p-5 lg:border-b-0 lg:border-r">
            <div className="mb-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/[0.08] px-3 py-1 text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-caps) text-cyan-700 dark:text-cyan-300">
                <FlaskConical className="h-3.5 w-3.5" />
                {t("UX Lab", { defaultValue: "UX Lab" })}
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t("Run Transcript Fixtures", { defaultValue: "Run Transcript Fixtures" })}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  "Built from a real Paperclip development run, then sanitized so no secrets, local paths, or environment details survive into the fixture.",
                  {
                    defaultValue:
                      "Built from a real Paperclip development run, then sanitized so no secrets, local paths, or environment details survive into the fixture.",
                  },
                )}
              </p>
            </div>

            <div className="space-y-2">
              {surfaceOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedSurface(option.id)}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left transition-all",
                      selectedSurface === option.id
                        ? "border-cyan-500/35 bg-cyan-500/[0.10] shadow-[0_12px_24px_rgba(6,182,212,0.12)]"
                        : "border-border/70 bg-background/70 hover:border-cyan-500/20 hover:bg-cyan-500/[0.04]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg border border-current/15 p-2 text-cyan-700 dark:text-cyan-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
                          {option.eyebrow}
                        </span>
                        <span className="mt-1 block text-sm font-medium">{option.label}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0 p-5">
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
                  {selected.eyebrow}
                </div>
                <h2 className="mt-1 text-2xl font-semibold">{selected.label}</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {selected.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps)">
                  {t("Source run {{value}}", {
                    value: runTranscriptFixtureMeta.sourceRunId.slice(0, 8),
                    defaultValue: "Source run {{value}}",
                  })}
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps)">
                  {runTranscriptFixtureMeta.issueIdentifier}
                </Badge>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
                {t("Controls", { defaultValue: "Controls" })}
              </span>
              <div className="inline-flex rounded-full border border-border/70 bg-background/80 p-1">
                {(["nice", "raw"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                      detailMode === mode ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setDetailMode(mode)}
                  >
                    {mode === "nice"
                      ? t("Readable", { defaultValue: "Readable" })
                      : t("Raw", { defaultValue: "Raw" })}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-full border border-border/70 bg-background/80 p-1">
                {(["comfortable", "compact"] as const).map((nextDensity) => (
                  <button
                    key={nextDensity}
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                      density === nextDensity ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setDensity(nextDensity)}
                  >
                    {nextDensity === "comfortable"
                      ? t("Comfortable", { defaultValue: "Comfortable" })
                      : t("Compact", { defaultValue: "Compact" })}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setStreaming((value) => !value)}
              >
                {streaming
                  ? t("Show settled state", { defaultValue: "Show settled state" })
                  : t("Show streaming state", { defaultValue: "Show streaming state" })}
              </Button>
            </div>

            {selectedSurface === "detail" ? (
              <div className={cn(density === "compact" && "max-w-5xl")}>
                <RunDetailPreview mode={detailMode} streaming={streaming} density={density} t={t} />
              </div>
            ) : selectedSurface === "live" ? (
              <div className={cn(density === "compact" && "max-w-4xl")}>
                <LiveWidgetPreview streaming={streaming} mode={detailMode} density={density} t={t} />
              </div>
            ) : (
              <DashboardPreview streaming={streaming} mode={detailMode} density={density} t={t} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
