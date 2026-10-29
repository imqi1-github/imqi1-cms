/**
 * link-audit skill 的百度机审结论聚合（.claude/skills/link-audit/scripts/lib.ts）。
 *
 * 回归重点：conclusionType=4（审核失败，数值最大）不得盖掉 2（不合规）——
 * 按数值取最差会让「某块不合规、另一块审核失败」的友链被判成未命中，静默漏出处置清单。
 */
import { describe, expect, test } from "bun:test";

import {
  BAIDU_CONCLUSION_TYPE,
  baiduSeverityRank,
  hasAuditFailure,
  pickWorstConclusion,
} from "../../../.claude/skills/link-audit/scripts/lib";

describe("百度机审结论严重度序", () => {
  test("违规(2) > 疑似(3) > 审核失败(4) > 合规(1)", () => {
    expect(baiduSeverityRank(BAIDU_CONCLUSION_TYPE.violation)).toBeGreaterThan(baiduSeverityRank(BAIDU_CONCLUSION_TYPE.suspicious));
    expect(baiduSeverityRank(BAIDU_CONCLUSION_TYPE.suspicious)).toBeGreaterThan(baiduSeverityRank(BAIDU_CONCLUSION_TYPE.auditFailed));
    expect(baiduSeverityRank(BAIDU_CONCLUSION_TYPE.auditFailed)).toBeGreaterThan(baiduSeverityRank(BAIDU_CONCLUSION_TYPE.compliant));
  });

  test("未知结论类型 rank 最低", () => {
    expect(baiduSeverityRank(0)).toBe(0);
    expect(baiduSeverityRank(99)).toBe(0);
  });
});

describe("pickWorstConclusion（按严重度而非数值取最差）", () => {
  test("审核失败(4) 与不合规(2) 并存 → 取不合规（曾按 max 取到 4，导致违规目标漏判）", () => {
    const blocks = [{ conclusionType: 4, tag: "fail" }, { conclusionType: 2, tag: "bad" }];
    expect(pickWorstConclusion(blocks)?.tag).toBe("bad");
  });

  test("审核失败(4) 在前、不合规(2) 在后 → 同样取不合规", () => {
    const blocks = [{ conclusionType: 2, tag: "bad" }, { conclusionType: 4, tag: "fail" }];
    expect(pickWorstConclusion(blocks)?.tag).toBe("bad");
  });

  test("疑似(3) 与审核失败(4) 并存 → 取疑似", () => {
    const blocks = [{ conclusionType: 4, tag: "fail" }, { conclusionType: 3, tag: "maybe" }];
    expect(pickWorstConclusion(blocks)?.tag).toBe("maybe");
  });

  test("合规(1) 与审核失败(4) 并存 → 取审核失败（结论未定，不能当合规）", () => {
    const blocks = [{ conclusionType: 1, tag: "ok" }, { conclusionType: 4, tag: "fail" }];
    expect(pickWorstConclusion(blocks)?.tag).toBe("fail");
  });

  test("空数组 → null", () => {
    expect(pickWorstConclusion([])).toBeNull();
  });
});

describe("hasAuditFailure", () => {
  test("存在 conclusionType=4 → true", () => {
    expect(hasAuditFailure([{ conclusionType: 1 }, { conclusionType: 4 }])).toBe(true);
  });

  test("存在本地异常（error）→ true", () => {
    expect(hasAuditFailure([{ conclusionType: 1, error: "overlength" }])).toBe(true);
  });

  test("无失败块（合规/疑似）→ false", () => {
    expect(hasAuditFailure([{ conclusionType: 1 }, { conclusionType: 3 }])).toBe(false);
  });
});
