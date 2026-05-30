// @vitest-environment node

import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { translateRuntimeErrorMessage } from "./error-i18n";
import {
  translateSystemGeneratedMarkdownText,
  translateSystemGeneratedText,
} from "./system-generated-message-i18n";

const zhTranslations: Record<string, string> = {
  "systemGenerated.outputSilence.criticalThresholdCrossed": "已超过关键输出静默阈值。",
  "systemGenerated.outputSilence.detectedSuspiciousActiveHeartbeatRun": "Paperclip 检测到一个活动心跳运行出现可疑输出静默。",
  "systemGenerated.outputSilence.detectedOnActiveRun": "Paperclip 检测到此任务的活动运行已达到关键输出静默。",
  "systemGenerated.outputSilence.blocksSourceIssue": "这会通过明确的复查任务阻塞来源任务，但不会取消仍在活动的进程。",
  "systemGenerated.label.run": "运行",
  "systemGenerated.label.evaluationIssue": "评估任务",
  "systemGenerated.label.silentFor": "静默时长",
  "systemGenerated.label.lastOutputAt": "最后输出时间",
  "systemGenerated.duration.hours": "{{count}} 小时",
  "systemGenerated.value.noneRecorded": "未记录",
  "systemGenerated.runEvent.queuedRetryAfterOrphanedProcess": "已确认孤立子进程结束，已排队自动重试",
  "systemGenerated.runEvent.cancelledDependenciesBlocked": "已取消：任务依赖仍被阻塞；阻塞解除后 Paperclip 会唤醒负责人",
  "systemGenerated.runEvent.cancelledTerminalStatusBeforeStart": "已取消：任务已在排队运行开始前进入终态（{{status}}）",
  "status.done": "已完成",
};

function makeT(translations: Record<string, string>): TFunction {
  return ((key: string, options?: Record<string, unknown>) => {
    const template = translations[key] ?? (typeof options?.defaultValue === "string" ? options.defaultValue : key);
    return template.replace(/\{\{(\w+)\}\}/g, (_match, token) => String(options?.[token] ?? ""));
  }) as TFunction;
}

describe("system-generated message i18n", () => {
  const t = makeT(zhTranslations);

  it("translates output-silence system notice markdown without touching ids", () => {
    const translated = translateSystemGeneratedMarkdownText(
      [
        "Critical output silence threshold crossed.",
        "",
        "- Run: `da7d59e5-7eec-4c3b-8019-b15157d3fcf1`",
        "- Silent for: 4h",
        "- Last output at: none recorded",
        "- Evaluation issue: BIG-52",
        "",
        "Paperclip detected critical output silence on this issue's active run.",
        "This blocks the source issue on the explicit review task without cancelling the active process.",
      ].join("\n"),
      t,
    );

    expect(translated).toContain("已超过关键输出静默阈值。");
    expect(translated).toContain("- 运行：`da7d59e5-7eec-4c3b-8019-b15157d3fcf1`");
    expect(translated).toContain("- 静默时长：4 小时");
    expect(translated).toContain("- 最后输出时间：未记录");
    expect(translated).toContain("- 评估任务：BIG-52");
    expect(translated).toContain("Paperclip 检测到此任务的活动运行已达到关键输出静默。");
    expect(translated).toContain("这会通过明确的复查任务阻塞来源任务");
    expect(translated).not.toContain("Critical output silence threshold crossed");
    expect(translated).not.toContain("Silent for");
  });

  it("translates generated issue descriptions but leaves ordinary markdown alone", () => {
    const generated = translateSystemGeneratedMarkdownText(
      [
        "Paperclip detected suspicious output silence on an active heartbeat run.",
        "",
        "## Run",
        "",
        "- Run: `abc123`",
        "- Silent for: 1h",
      ].join("\n"),
      t,
    );

    expect(generated).toContain("Paperclip 检测到一个活动心跳运行出现可疑输出静默。");
    expect(generated).toContain("- 静默时长：1 小时");

    const ordinary = translateSystemGeneratedMarkdownText("- Run: customer workflow", t);
    expect(ordinary).toBe("- Run: customer workflow");
  });

  it("translates run events and runtime errors with the same catalog", () => {
    expect(
      translateSystemGeneratedText(t, "Queued automatic retry after orphaned child process was confirmed dead"),
    ).toBe("已确认孤立子进程结束，已排队自动重试");

    expect(
      translateRuntimeErrorMessage(
        t,
        "Cancelled because issue dependencies are still blocked; Paperclip will wake the assignee when blockers resolve",
      ),
    ).toBe("已取消：任务依赖仍被阻塞；阻塞解除后 Paperclip 会唤醒负责人");

    expect(
      translateSystemGeneratedText(
        t,
        "Cancelled because issue reached terminal status (done) before the queued run could start",
      ),
    ).toBe("已取消：任务已在排队运行开始前进入终态（已完成）");
  });
});
