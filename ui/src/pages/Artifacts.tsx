import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Package, Search, X } from "lucide-react";
import { artifactsApi, type ArtifactKindFilter } from "../api/artifacts";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { ArtifactCard } from "../components/artifacts/ArtifactCard";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const ARTIFACTS_PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 250;

const KIND_FILTERS: { value: ArtifactKindFilter; labelKey: string }[] = [
  { value: "all", labelKey: "artifacts.filter.all" },
  { value: "image", labelKey: "artifacts.filter.images" },
  { value: "video", labelKey: "artifacts.filter.videos" },
  { value: "document", labelKey: "artifacts.filter.documents" },
  { value: "text", labelKey: "artifacts.filter.text" },
  { value: "file", labelKey: "artifacts.filter.files" },
];

export function Artifacts() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [kind, setKind] = useState<ArtifactKindFilter>("all");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: t("artifacts.title") }]);
  }, [setBreadcrumbs, t]);

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(draftQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [draftQuery]);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: queryKeys.artifacts.list(selectedCompanyId!, kind, query),
    queryFn: ({ pageParam }) =>
      artifactsApi.list(selectedCompanyId!, {
        kind,
        q: query || undefined,
        limit: ARTIFACTS_PAGE_SIZE,
        cursor: pageParam,
      }),
    enabled: !!selectedCompanyId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void fetchNextPage();
      }
    }, { rootMargin: "320px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const artifacts = useMemo(() => data?.pages.flatMap((page) => page.artifacts) ?? [], [data]);
  const searching = query.length > 0;

  if (!selectedCompanyId) {
    return <EmptyState icon={Package} message={t("artifacts.selectCompany")} />;
  }

  return (
    <div className="w-full max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.currentTarget.value)}
            placeholder={t("artifacts.searchPlaceholder")}
            aria-label={t("artifacts.searchAria")}
            className="h-9 pl-9 pr-9 text-sm"
          />
          {draftQuery.length > 0 ? (
            <button
              type="button"
              onClick={() => setDraftQuery("")}
              aria-label={t("artifacts.clearSearch")}
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t("artifacts.filterAria")}>
          {KIND_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={kind === filter.value}
              onClick={() => setKind(filter.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                kind === filter.value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {t(filter.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : artifacts.length === 0 ? (
        <EmptyState
          icon={Package}
          message={
            searching
              ? t("artifacts.emptySearch")
              : kind === "all"
                ? t("artifacts.emptyAll")
                : t("artifacts.emptyKind")
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {artifacts.map((artifact) => (
              <ArtifactCard key={`${artifact.source}:${artifact.id}`} artifact={artifact} />
            ))}
          </div>
          <div ref={loadMoreRef} className="flex min-h-10 items-center justify-center pb-2 text-xs text-muted-foreground">
            {isFetchingNextPage
              ? t("artifacts.loadingMore")
              : hasNextPage
                ? null
                : isFetching
                  ? t("artifacts.updating")
                  : null}
          </div>
        </>
      )}
    </div>
  );
}
