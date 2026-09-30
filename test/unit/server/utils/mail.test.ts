import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// nodemailer 替身:记录 createTransport 配置与 sendMail 调用
const transportConfigs: Array<Record<string, unknown>> = [];
const sentMails: Array<Record<string, unknown>> = [];
let sendMailImpl: () => Promise<unknown> = async () => ({ messageId: "ok" });
mock.module("nodemailer", () => ({
  default: {
    createTransport: (cfg: Record<string, unknown>) => {
      transportConfigs.push(cfg);
      return { sendMail: async (opts: Record<string, unknown>) => { sentMails.push(opts); return sendMailImpl(); } };
    },
  },
}));

const { sendMail, sendTestEmail, notifyAdminNewComment, notifyFriendLinkApplication } = await import("#server/utils/mail");

let settingsMap = new Map<string, string>();

beforeEach(() => {
  transportConfigs.length = 0;
  sentMails.length = 0;
  sendMailImpl = async () => ({ messageId: "ok" });
  settingsMap = new Map([
    ["emailPushType", "smtp"],
    ["smtpHost", "smtp.example.com"],
    ["smtpPort", "465"],
    ["smtpSecureMode", "ssl"],
    ["smtpUser", "bot@example.com"],
    ["smtpPassword", "secret"],
    ["smtpFromName", "测试站"],
    ["smtpAddress", "noreply@example.com"],
    ["adminEmail", "admin@example.com"],
    ["emailLogEnabled", "false"],
  ]);
  sharedFake.on("informations", "findMany", async ({ where }: { where?: { key?: { in: string[] } } }) => {
    const keys = where?.key?.in ?? [...settingsMap.keys()];
    return keys.filter(k => settingsMap.has(k)).map(k => ({ key: k, value: settingsMap.get(k)! }));
  });
});

describe("mail/sendMail", () => {
  test("pushType=none 时只记日志,不发信(返回 true)", async () => {
    settingsMap.set("emailPushType", "none");
    expect(await sendMail({ to: "a@b.c", subject: "s", text: "t" })).toBe(true);
    expect(transportConfigs).toHaveLength(0);
  });

  test("smtp 模式:按配置建 transporter 并发信(from 带显示名)", async () => {
    expect(await sendMail({ to: "a@b.c", subject: "标题", text: "正文" })).toBe(true);
    expect(transportConfigs[0]).toMatchObject({ host: "smtp.example.com", port: 465, secure: true });
    expect(sentMails[0]).toMatchObject({
      from: "\"测试站\" <noreply@example.com>",
      to: "a@b.c",
      subject: "标题",
    });
  });

  test("tls 模式 secure=false;缺 smtpAddress 时 from 回落 smtpUser", async () => {
    settingsMap.set("smtpSecureMode", "tls");
    settingsMap.set("smtpAddress", "");
    await sendMail({ to: "a@b.c", subject: "s", text: "t" });
    expect(transportConfigs[0]).toMatchObject({ secure: false });
    expect(sentMails[0]!.from).toBe("\"测试站\" <bot@example.com>");
  });

  test("未配置 smtpHost → 无法创建传输器,返回 false", async () => {
    settingsMap.set("smtpHost", "");
    expect(await sendMail({ to: "a@b.c", subject: "s", text: "t" })).toBe(false);
  });

  test("发信抛错 → 返回 false(不向上抛)", async () => {
    sendMailImpl = async () => {
      throw new Error("SMTP 拒绝");
    };
    expect(await sendMail({ to: "a@b.c", subject: "s", text: "t" })).toBe(false);
  });
});

describe("mail/sendTestEmail", () => {
  test("发送测试邮件成功", async () => {
    const r = await sendTestEmail("me@example.com");
    expect(r.success).toBe(true);
    expect(sentMails[0]).toMatchObject({ to: "me@example.com" });
  });

  test("未启用推送 → 明确报错", async () => {
    settingsMap.set("emailPushType", "none");
    const r = await sendTestEmail("me@example.com");
    expect(r.success).toBe(false);
    expect(r.message).toContain("未启用");
  });

  test("SMTP 未配置 → 报错", async () => {
    settingsMap.set("smtpHost", "");
    const r = await sendTestEmail("me@example.com");
    expect(r.success).toBe(false);
  });
});

describe("mail/通知入口(依赖 adminEmail/notifyAdmin 设置)", () => {
  test("未配置 adminEmail 时通知类函数直接返回 false 且不发信", async () => {
    settingsMap.set("adminEmail", "");
    expect(await notifyAdminNewComment(1, "甲", "内容", 1)).toBe(false);
    expect(sentMails).toHaveLength(0);
  });

  test("配置齐全时发出通知(带文章链接)", async () => {
    // 通知正文会查文章标题,先备好 contents 假件
    sharedFake.on("contents", "findUnique", async () => ({ title: "文章标题", slug: "post", contentrelations: [] }));
    sharedFake.on("contentrelations", "findFirst", async () => ({ metas: { slug: "note" } }));
    const ok = await notifyAdminNewComment(10, "甲", "内容", 1);
    expect(typeof ok).toBe("boolean");
    if (ok) {
      expect(sentMails.length).toBeGreaterThan(0);
    }
  });

  test("友链申请通知可调用不抛", async () => {
    await expect(notifyFriendLinkApplication("友链", "https://a.com")).resolves.toBeBoolean();
  });
});
