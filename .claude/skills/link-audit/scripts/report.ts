#!/usr/bin/env bun
/**
 * 汇总百度机审结果 → Markdown 审查报告
 *
 * 用法：
 *   bun .claude/skills/link-audit/scripts/report.ts --work "$WORK" [--out <work>/report.md] [--verdicts <work>/verdicts.json]
 *
 * 主数据源是 baidu-audit.ts 产出的 moderation.json（机审判定即结论）。
 * verdicts.json 为可选的人工标注：可覆盖某目标的判定与建议（用于标记误报）。
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs, readJson, writeText } from "./lib";

interface ModerationHit {
  keyword: string;
  charStart: number;
  charEnd: number;
  risk: string;
  detail: string;
  msg: string;
  prob: number;
  file: string;
}

interface ModerationTarget {
  targetKind: "link" | "subscribe";
  targetId: number;
  name: string;
  url: string;
  conclusionType: number;
  conclusion: string;
  chars: number;
  files: string[];
  hits: ModerationHit[];
  logIds: number[];
}

interface Moderation {
  generatedAt: string;
  credentialSource: string;
  summary: { items: number; targets: number; flaggedTargets: number; failed: number; byConclusion: Record<string, number> };
  targets: ModerationTarget[];
}

interface ManifestTarget {
  kind: "link" | "subscribe";
  id: number;
  name: string;
  url: string;
  reachable: boolean;
  error: string | null;
  notes: string[];
}

interface Manifest {
  generatedAt: string;
  source: string;
  base: string;
  targets: ManifestTarget[];
}

interface ManualVerdict {
  verdict?: string;
  recommendation?: string;
  note?: string;
}

/** 机审结论 → 置信度（确定性映射，见 reference/rubric.md）。 */
function confidenceOf(conclusionType: number): number {
  if (conclusionType === 2) return 0.9;
  if (conclusionType === 3) return 0.65;
  return 0;
}

/** 高危子类：命中这些才值得优先看（其余多为博客口语/日常词造成的误报）。 */
const HIGH_RISK_LABELS = ["涉黄", "色情", "性行为", "赌博", "涉赌", "毒品", "涉恐", "恐怖", "枪支", "暴力", "涉政", "领导人", "诈骗", "刷单", "木马"];

function isHighRisk(target: ModerationTarget): boolean {
  return target.hits.some(hit => {
    const label = `${hit.risk ?? ""} ${hit.msg ?? ""}`;
    return HIGH_RISK_LABELS.some(key => label.includes(key));
  });
}

/** 判定名 → 结论类型（人工标注覆盖机审后，置信度按生效判定算）。 */
function typeOfVerdict(verdict: string | undefined, fallback: number): number {
  if (!verdict) return fallback;
  const v = verdict.trim();
  // 「不合规」必须先判：它包含子串「合规」，先判合规会把不合规误归为合规
  if (v.includes("不合规") || v.includes("违规")) return 2;
  if (v.includes("疑似")) return 3;
  if (v.includes("误报") || v.includes("合规")) return 1;
  return fallback;
}

/** 生效判定：人工标注优先于机审结论。 */
function effectiveVerdict(target: ModerationTarget): { verdict: string; type: number; confidence: number } {
  const manualVerdict = manual[`${target.targetKind}:${target.targetId}`];
  const verdict = manualVerdict?.verdict ?? target.conclusion;
  const type = typeOfVerdict(verdict, target.conclusionType);
  return { verdict, type, confidence: confidenceOf(type) };
}

/** 命中位置截一段上下文，便于人工一眼判断；并定位落在快照的哪一段（标题/摘要/正文）。 */
async function contextAround(hit: ModerationHit): Promise<{ context: string; field: string }> {
  try {
    const file = Bun.file(hit.file);
    if (!(await file.exists())) return { context: "", field: "" };
    const raw = await file.text();
    const body = raw.split("\n---\n").slice(1).join("\n---\n");
    const start = Math.max(0, hit.charStart - 40);
    const end = Math.min(body.length, hit.charEnd + 40);
    let field = "";
    for (const marker of ["【标题】", "【摘要】", "【正文】"]) {
      const index = body.indexOf(marker);
      if (index >= 0 && index <= hit.charStart) field = marker.replace(/[【】]/g, "");
    }
    return { context: body.slice(start, end).replace(/\s+/g, " ").trim(), field };
  } catch {
    return { context: "", field: "" };
  }
}

const args = parseArgs(process.argv.slice(2));
const workDir = typeof args.work === "string" ? args.work : join(tmpdir(), "link-audit");
const out = typeof args.out === "string" ? args.out : join(workDir, "report.md");
const verdictsPath = typeof args.verdicts === "string" ? args.verdicts : join(workDir, "verdicts.json");

const moderation = await readJson<Moderation>(join(workDir, "moderation.json"));

let manifest: Manifest | null;
try {
  manifest = await readJson<Manifest>(join(workDir, "manifest.json"));
} catch {
  manifest = null;
}

let manual: Record<string, ManualVerdict> = {};
try {
  const verdicts = await readJson<{ findings?: Array<{ targetKind?: string; targetId?: number; verdict?: string; recommendation?: string; basis?: string }> }>(verdictsPath);
  for (const finding of verdicts.findings ?? []) {
    const key = `${finding.targetKind}:${finding.targetId}`;
    manual[key] = { verdict: finding.verdict, recommendation: finding.recommendation, note: finding.basis };
  }
} catch {
  manual = {};
}

const flagged = moderation.targets.filter(t => {
  const effective = effectiveVerdict(t);
  return effective.type === 2 || effective.type === 3;
});
const dismissed = moderation.targets.filter(t => {
  const effective = effectiveVerdict(t);
  return (t.conclusionType === 2 || t.conclusionType === 3) && effective.type === 1;
});

const lines: string[] = [];
lines.push("# 友链与订阅合规审查报告（百度内容审核）");
lines.push("");
lines.push(`- 判定引擎：百度内容审核（自定义文本审核 v2）｜凭证来源：${moderation.credentialSource}`);
lines.push(`- 审查时间：${moderation.generatedAt}`);
if (manifest) {
  lines.push(`- 覆盖目标：${manifest.targets.length} 个（友链 ${manifest.targets.filter(t => t.kind === "link").length} / 订阅源 ${manifest.targets.filter(t => t.kind === "subscribe").length}）`);
}
lines.push(`- 机审覆盖：${moderation.summary.items} 份快照 / ${moderation.summary.targets} 个目标，审核失败 ${moderation.summary.failed} 份`);
lines.push(`- 需处置：${flagged.length} 个目标（机审判定为不合规或疑似）`);
lines.push(`- 其中命中高危子类（涉黄/赌博/毒品/涉恐等）：${flagged.filter(isHighRisk).length} 个，优先复核`);
lines.push("");
lines.push("> 判定为机审原始结论；**「疑似」「不合规」不等于违规成立**——博客语境下机审常把站点名、友链区等普通表述判为风险，处置前请按「命中词 + 风险子类 + 上下文」逐条过目。");
lines.push(">");
lines.push("> 审查范围：**只判各友链/订阅源自己的内容**。对方页面里的友链区、外链聚合、留言板已在抓取阶段屏蔽（那些是他们自己的责任，不记到本站头上）。");
lines.push("");

lines.push("## 一、需处置清单");
lines.push("");
if (!flagged.length) {
  lines.push("机审未标记任何目标。");
} else {
  lines.push("| # | 类型 | 名称 | 地址 | 机审结论 | 置信度 | 风险子类 | 命中 | 建议 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [index, target] of flagged.entries()) {
    const kind = target.targetKind === "subscribe" ? "订阅" : "友链";
    const risks = [...new Set(target.hits.map(h => h.risk || h.msg).filter(Boolean))];
    const riskCell = risks.length ? `${risks[0]}${risks.length > 1 ? ` 等 ${risks.length} 类` : ""}` : "—";
    const effective = effectiveVerdict(target);
    const manualVerdict = manual[`${target.targetKind}:${target.targetId}`];
    const defaultAdvice = isHighRisk(target) ? "**优先**人工复核" : "人工复核";
    lines.push(
      `| ${index + 1} | ${kind} | ${target.name} | ${target.url || "—"} | ${effective.verdict} | ${effective.confidence.toFixed(2)} | ${riskCell} | ${target.hits.length} | ${manualVerdict?.recommendation ?? defaultAdvice} |`,
    );
  }
}
lines.push("");

lines.push("## 二、逐条详述");
lines.push("");
if (!flagged.length) {
  lines.push("（无）");
}
for (const [index, target] of flagged.entries()) {
  const kind = target.targetKind === "subscribe" ? "订阅源" : "友链";
  const effective = effectiveVerdict(target);
  lines.push(`### ${index + 1}. ${target.name}（${kind}｜${effective.verdict}｜置信度 ${effective.confidence.toFixed(2)}）`);
  lines.push("");
  lines.push(`- 地址：${target.url || "—"}`);
  lines.push(`- 机审 logId：${target.logIds.join(", ") || "—"}（可作处置留档凭证）`);
  const manualVerdict = manual[`${target.targetKind}:${target.targetId}`];
  if (manualVerdict?.note) lines.push(`- 人工标注：${manualVerdict.note}`);
  lines.push(`- 命中明细（${target.hits.length} 处）：`);
  for (const hit of target.hits.slice(0, 20)) {
    const risk = hit.risk || hit.detail || hit.msg || "—";
    const { context, field } = await contextAround(hit);
    const where = field ? `${field}段` : hit.file.split(/[\\/]/).pop();
    lines.push(`  - \`${hit.keyword.replace(/\n/g, " ")}\`｜${risk}｜${where}｜位置 ${hit.charStart}-${hit.charEnd}`);
    if (context) lines.push(`    - 上下文：${context}`);
  }
  if (target.hits.length > 20) lines.push(`  - …另有 ${target.hits.length - 20} 处命中`);
  lines.push("");
}

if (dismissed.length) {
  lines.push("## 三、人工判定为误报（已排除，不需处置）");
  lines.push("");
  lines.push("| 类型 | 名称 | 地址 | 机审结论 | 人工标注 | 建议 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const target of dismissed) {
    const kind = target.targetKind === "subscribe" ? "订阅" : "友链";
    const manualVerdict = manual[`${target.targetKind}:${target.targetId}`];
    lines.push(`| ${kind} | ${target.name} | ${target.url || "—"} | ${target.conclusion} | ${manualVerdict?.verdict ?? "误报"} | ${manualVerdict?.recommendation ?? "保留观察"} |`);
  }
  lines.push("");
}

if (manifest) {
  const uncovered = manifest.targets.filter(
    target => !moderation.targets.some(t => t.targetKind === target.kind && t.targetId === target.id),
  );
  lines.push(`${dismissed.length ? "## 四" : "## 三"}、未覆盖 / 未命中的目标`);
  lines.push("");
  if (!uncovered.length) {
    lines.push("（全部目标均有机审结论）");
  } else {
    lines.push("| 类型 | 名称 | 地址 | 机审结论 | 说明 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const target of uncovered) {
      const kind = target.kind === "subscribe" ? "订阅" : "友链";
      const state = target.reachable ? "合规" : `不可达（${target.error ?? "未知"}）`;
      lines.push(`| ${kind} | ${target.name} | ${target.url || "—"} | ${state} | ${target.notes.join("；") || "—"} |`);
    }
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push("说明：判定与置信度来自百度内容审核的原始结论（不合规 0.90 / 疑似 0.65），不是法律结论；处置前请逐条核对命中上下文。");

await writeText(out, `${lines.join("\n")}\n`);
console.log(`[report] 已生成 ${out}（需处置 ${flagged.length} 个目标）`);
