import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ChevronRight, LockKeyhole } from "lucide-react";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

const skeletonLabels = {
  not_requested: "尚未生成",
  pending: "PM Agent 生成中",
  draft: "待项目经理确认",
  confirmed: "已建立基线",
  failed: "生成失败",
} as const;

export function ProjectDeliveryBoard({
  projectId,
  companyId,
}: {
  projectId: string;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const delivery = useQuery({
    queryKey: queryKeys.projects.delivery(projectId),
    queryFn: () => projectsApi.getDelivery(projectId, companyId),
    refetchInterval: (query) => query.state.data?.skeletonStatus === "pending" ? 5000 : false,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.delivery(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(companyId) });
  };
  const generate = useMutation({
    mutationFn: () => projectsApi.requestDeliverySkeleton(projectId, companyId),
    onSuccess: refresh,
  });
  const confirm = useMutation({
    mutationFn: () => projectsApi.confirmDeliverySkeleton(projectId, companyId),
    onSuccess: refresh,
  });
  const advance = useMutation({
    mutationFn: (stageId: string) => projectsApi.advanceDeliveryStage(projectId, stageId, companyId),
    onSuccess: refresh,
  });

  if (delivery.isLoading) return <p className="text-sm text-muted-foreground">正在加载项目交付闭环…</p>;
  if (delivery.error) return <p className="text-sm text-destructive">{delivery.error.message}</p>;
  const model = delivery.data;
  if (!model) return null;

  return (
    <div className="space-y-5">
      <section className="border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">数字孪生（故事驱动）</div>
            <h3 className="mt-1 text-base font-semibold">六阶段项目交付闭环</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              必选任务进度 {model.completedRequiredTaskCount}/{model.requiredTaskCount}
              <span className="mx-2">·</span>
              任务骨架：{skeletonLabels[model.skeletonStatus]}
            </p>
          </div>
          <div className="flex gap-2">
            {model.skeletonStatus !== "confirmed" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!model.pmAgentId || generate.isPending || model.skeletonStatus === "pending"}
                onClick={() => generate.mutate()}
              >
                <Bot className="mr-1.5 h-4 w-4" />
                {model.pmAgentId ? "让 PM Agent 生成骨架" : "请先配置 PM Agent"}
              </Button>
            ) : null}
            {model.skeletonStatus === "draft" ? (
              <Button
                size="sm"
                disabled={confirm.isPending || !model.plannedStartDate || !model.targetDate}
                onClick={() => confirm.mutate()}
              >
                确认全项目任务骨架
              </Button>
            ) : null}
          </div>
        </div>
        {model.skeletonError ? <p className="mt-3 text-xs text-destructive">{model.skeletonError}</p> : null}
        {generate.error ? <p className="mt-3 text-xs text-destructive">{generate.error.message}</p> : null}
        {confirm.error ? <p className="mt-3 text-xs text-destructive">{confirm.error.message}</p> : null}
        {advance.error ? <p className="mt-3 text-xs text-destructive">{advance.error.message}</p> : null}
        {model.skeletonStatus === "draft" && (!model.plannedStartDate || !model.targetDate) ? (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            确认骨架前必须补齐计划开始日期和目标完成日期。
          </p>
        ) : null}
      </section>

      <div className="grid gap-3">
        {model.stages.map((stage, index) => (
          <section
            key={stage.id}
            className={cn(
              "border p-4",
              stage.status === "active" ? "border-primary/50 bg-primary/5" : "border-border bg-card",
              stage.status === "locked" && "opacity-70",
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                stage.status === "completed" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
                stage.status === "active" && "border-primary bg-primary text-primary-foreground",
              )}>
                {stage.status === "completed" ? <Check className="h-4 w-4" /> : stage.status === "locked" ? <LockKeyhole className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{stage.name}</h4>
                  <span className="text-xs text-muted-foreground">
                    {stage.completedRequiredTaskCount}/{stage.requiredTaskCount} 必选任务
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${stage.progressPercent}%` }} />
                </div>
              </div>
              {stage.status === "active" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={advance.isPending || model.skeletonStatus !== "confirmed"}
                  onClick={() => advance.mutate(stage.id)}
                >
                  确认进入下一阶段
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {stage.taskGroups.map((group) => (
                <div key={group.id} className="border border-border/70 bg-background/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{group.name}</span>
                    <span className="text-xs text-muted-foreground">{group.progressPercent}%</span>
                  </div>
                  {group.tasks.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {group.tasks.map((task) => (
                        <li key={task.id} className="flex items-start gap-2 text-xs">
                          <span className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                            task.status === "done" ? "bg-emerald-500" : task.status === "blocked" ? "bg-destructive" : "bg-muted-foreground",
                          )} />
                          <span className="min-w-0 flex-1">{task.title}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {task.taskType === "gate" ? "门禁" : task.taskType === "deliverable" ? "交付物" : task.isRequired ? "必选" : "可选"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">待 PM Agent 根据项目材料生成具体任务</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
