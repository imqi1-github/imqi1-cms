import "#test/helpers/nitro-globals";

import { describe, expect, test } from "bun:test";

import { getChangelogMeta } from "#shared/changelog";
import {
  validateAttachmentData,
  validateChangelogData,
  validateCommentData,
  validateContentData,
  validateLinkData,
  validateMaxLength,
  validateMetaData,
  validateSettingsData,
  validateSubscribeData,
  validateTravelData,
  validateUserData,
} from "#server/utils/validation";

// h3 createError 抛出的错误带 statusCode;统一断言 400 + 消息
function expect400(fn: () => void, message?: string): void {
  try {
    fn();
    throw new Error("应当抛出 400");
  } catch (error) {
    expect((error as { statusCode?: number }).statusCode).toBe(400);
    if (message) expect((error as { message?: string }).message).toContain(message);
  }
}

// 逐字段验证「恰好上限不抛、超 1 抛 400」
function fieldCaps(fn: (data: Record<string, string>) => void, field: string, cap: number): void {
  expect(() => fn({ [field]: "x".repeat(cap) })).not.toThrow();
  expect400(() => fn({ [field]: "x".repeat(cap + 1) }));
}

describe("validateMaxLength", () => {
  test("恰好等于上限不抛", () => {
    expect(() => validateMaxLength("a".repeat(255), 255, "字段")).not.toThrow();
  });

  test("超 1 个字符抛 400,消息含上限与字段名", () => {
    expect400(() => validateMaxLength("a".repeat(256), 255, "昵称"), "255");
  });

  test("中文按 UTF-16 码元计(1 个汉字 = 1)", () => {
    expect(() => validateMaxLength("好".repeat(100), 100, "名称")).not.toThrow();
    expect400(() => validateMaxLength("好".repeat(101), 100, "名称"));
  });

  test("null / undefined / 空串不抛", () => {
    expect(() => validateMaxLength(null, 10, "x")).not.toThrow();
    expect(() => validateMaxLength(undefined, 10, "x")).not.toThrow();
    expect(() => validateMaxLength("", 10, "x")).not.toThrow();
  });
});

describe("validateCommentData", () => {
  test("各字段在上限内不抛", () => {
    expect(() =>
      validateCommentData({ name: "n".repeat(255), mail: "m".repeat(255), link: "l".repeat(500) }),
    ).not.toThrow();
  });

  test("link 超 500 抛 400(列长 VarChar(500))", () => {
    expect400(() => validateCommentData({ link: "l".repeat(501) }), "链接");
  });

  test("null 字段跳过校验", () => {
    expect(() => validateCommentData({ mail: null, link: null })).not.toThrow();
  });
});

describe("validateUserData", () => {
  test("name 上限 100、mail 上限 191", () => {
    expect(() => validateUserData({ name: "n".repeat(100), mail: "m".repeat(191) })).not.toThrow();
    expect400(() => validateUserData({ name: "n".repeat(101) }));
    expect400(() => validateUserData({ mail: "m".repeat(192) }));
  });
});

describe("validateChangelogData", () => {
  const okEntry = { type: "修复", value: "修了个 bug" };

  test("合法条目不抛", () => {
    expect(() => validateChangelogData([okEntry, { type: "功能", value: "新功能" }])).not.toThrow();
  });

  test("非数组 / 空数组抛 400", () => {
    expect400(() => validateChangelogData("not-array"));
    expect400(() => validateChangelogData([]));
  });

  test("超过 50 条抛 400", () => {
    expect400(() => validateChangelogData(Array.from({ length: 51 }, () => ({ ...okEntry }))), "50");
  });

  test("type 不在合法类别抛 400", () => {
    expect400(() => validateChangelogData([{ type: "不存在的类型", value: "x" }]));
  });

  test("value 空串/纯空白/缺失抛 400", () => {
    expect400(() => validateChangelogData([{ type: "修复", value: "" }]));
    expect400(() => validateChangelogData([{ type: "修复", value: "   " }]));
    expect400(() => validateChangelogData([{ type: "修复" }]));
  });

  test("value 超 20000 抛 400", () => {
    expect400(() => validateChangelogData([{ type: "修复", value: "v".repeat(20001) }]));
  });

  test("非对象条目抛 400", () => {
    expect400(() => validateChangelogData([null]));
    expect400(() => validateChangelogData([42]));
  });
});

describe("validateSettingsData", () => {
  test("homeCustomText 超 191 抛 400(曾遗漏的键,列是 VarChar(191))", () => {
    expect400(() => validateSettingsData({ homeCustomText: "t".repeat(192) }), "191");
  });

  test("全部合法不抛", () => {
    expect(() =>
      validateSettingsData({ siteName: "s".repeat(100), homeCustomText: "t".repeat(191) }),
    ).not.toThrow();
  });

  test("null 值跳过", () => {
    expect(() => validateSettingsData({ siteName: null })).not.toThrow();
  });

  test("各字段上限抽查", () => {
    fieldCaps(validateSettingsData, "siteName", 100);
    fieldCaps(validateSettingsData, "siteUrl", 191);
    fieldCaps(validateSettingsData, "commentAvatarService", 50);
    fieldCaps(validateSettingsData, "cosRegion", 100);
    fieldCaps(validateSettingsData, "musicPlaylistId", 191);
    fieldCaps(validateSettingsData, "uploadLocation", 50);
    fieldCaps(validateSettingsData, "messageContentId", 50);
    fieldCaps(validateSettingsData, "adminEmail", 191);
  });
});

describe("getChangelogMeta", () => {
  test("合法类别取到专属元数据,未知类别回退「其他」", () => {
    expect(getChangelogMeta("修复").icon).toBe("lucide:bug");
    expect(getChangelogMeta("不存在的").label).toBe("其他");
  });
});

describe("其余 validateXxxData 包装(字段上限一表)", () => {
  test("validateContentData: title/slug 均 255", () => {
    fieldCaps(validateContentData, "title", 255);
    fieldCaps(validateContentData, "slug", 255);
  });

  test("validateMetaData: name/slug 100、desc 191", () => {
    fieldCaps(validateMetaData, "name", 100);
    fieldCaps(validateMetaData, "slug", 100);
    fieldCaps(validateMetaData, "desc", 191);
  });

  test("validateLinkData: name 100、desc/link/avatar 191", () => {
    fieldCaps(validateLinkData, "name", 100);
    fieldCaps(validateLinkData, "desc", 191);
    fieldCaps(validateLinkData, "link", 191);
    fieldCaps(validateLinkData, "avatar", 191);
  });

  test("validateSubscribeData: name 100、url/avatar 191", () => {
    fieldCaps(validateSubscribeData, "name", 100);
    fieldCaps(validateSubscribeData, "url", 191);
    fieldCaps(validateSubscribeData, "avatar", 191);
  });

  test("validateAttachmentData: type 50、title/url 191", () => {
    fieldCaps(validateAttachmentData, "type", 50);
    fieldCaps(validateAttachmentData, "title", 191);
    fieldCaps(validateAttachmentData, "url", 191);
  });

  test("validateTravelData: name 255、desc 20000、cover 500", () => {
    fieldCaps(validateTravelData, "name", 255);
    fieldCaps(validateTravelData, "desc", 20000);
    fieldCaps(validateTravelData, "cover", 500);
  });
});
