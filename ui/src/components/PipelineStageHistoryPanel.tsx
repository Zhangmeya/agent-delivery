import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, History, RotateCcw } from "lucide-react";
import { ApiError } from "../api/client";
import { pipelinesApi, type PipelineDocumentRevision } from "../api/pipelines";
import { queryKeys } from "../lib/queryKeys";
import { useToastActions } from "../context/ToastContext";
import { timeAgo } from "../lib/timeAgo";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "../lib/utils";

/**
 * Compact revisions panel for a per-stage instructions document. Mirrors the
 * visual language of `RoutineHistoryTab` without its hard coupling to
 * `routinesApi`/`queryKeys.routines.*`. Restoring writes a new head revision
 * server-side, so it is non-destructive.
 */
export function PipelineStageHistoryPanel({
  pipelineId,
  documentKey,
  currentRevisionId,
  hasDocument,
  onRestored,
}: {
  pipelineId: string;
  documentKey: string;
  currentRevisionId: string | null;
  hasDocument: boolean;
  onRestored: (body: string, baseRevisionId: string | null) => void;
}) {
  const { t } = useTranslation(undefined, { useSuspense: false });
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const revisionsQuery = useQuery({
    queryKey: queryKeys.pipelines.documentRevisions(pipelineId, documentKey),
    queryFn: async () => {
      try {
        return await pipelinesApi.listDocumentRevisions(pipelineId, documentKey);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return [] as PipelineDocumentRevision[];
        throw error;
      }
    },
    enabled: open && hasDocument,
  });

  const restore = useMutation({
    mutationFn: (revisionId: string) => pipelinesApi.restoreDocumentRevision(pipelineId, documentKey, revisionId),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.document(pipelineId, documentKey) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.documentRevisions(pipelineId, documentKey) }),
      ]);
      onRestored(result.revision.body, result.revision.id);
      pushToast({
        title: t("pipelineStageHistory.restoredRevision", {
          defaultValue: "Restored revision {{number}}",
          number: result.restoredFromRevisionNumber,
        }),
        body: t("pipelineStageHistory.savedAsRevision", {
          defaultValue: "Saved as revision {{number}}.",
          number: result.revision.revisionNumber,
        }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("pipelineStageHistory.restoreFailed", { defaultValue: "Failed to restore revision" }),
        body: error instanceof Error ? error.message : t("pipelineStageHistory.restoreFailedBody", { defaultValue: "Paperclip could not restore the revision." }),
        tone: "error",
      });
    },
  });

  const revisions = revisionsQuery.data ?? [];

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-lg border border-border/70">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{t("pipelineStageHistory.title", { defaultValue: "History" })}</p>
            <p className="text-xs text-muted-foreground">{t("pipelineStageHistory.description", { defaultValue: "Past versions of these instructions." })}</p>
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/70">
        {!hasDocument ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            {t("pipelineStageHistory.noHistory", { defaultValue: "No history yet. Save the instructions to create the first revision." })}
          </p>
        ) : revisionsQuery.isLoading ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">{t("documentDiff.loadingRevisions", { defaultValue: "Loading revisions..." })}</p>
        ) : revisionsQuery.error ? (
          <p className="px-4 py-3 text-xs text-destructive">
            {revisionsQuery.error instanceof Error ? revisionsQuery.error.message : t("pipelineStageHistory.loadFailed", { defaultValue: "Could not load revisions." })}
          </p>
        ) : revisions.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">{t("pipelineStageHistory.noRevisions", { defaultValue: "No revisions recorded yet." })}</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {revisions.map((revision) => {
              const isCurrent = revision.id === currentRevisionId;
              return (
                <li
                  key={revision.id}
                  className={cn("flex items-center justify-between gap-3 px-4 py-2.5", isCurrent && "bg-accent/30")}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {t("pipelineStageHistory.revision", { defaultValue: "Revision {{number}}", number: revision.revisionNumber })}
                      {isCurrent ? (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {t("documentFrame.current", { defaultValue: "Current" })}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(revision.createdAt)}
                      {revision.changeSummary ? ` · ${revision.changeSummary}` : ""}
                    </p>
                  </div>
                  {isCurrent ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(revision.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("pipelineStageHistory.restore", { defaultValue: "Restore" })}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
