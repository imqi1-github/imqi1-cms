import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// nodemailer 捕获
const sentMails: Array<Record<string, unknown>> = [];
mock.module("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (opts: Record<string, unknown>) => {
        sentMails.push(opts);
        return { messageId: "ok" };
      },
    }),
  },
}));

// 站点内容假件:文章 + 分类关系 + 留言板
let contentRow: Record<string, unknown> | null = {
  title: "文章标题", slug: "post-a", type: 0,
  contentrelations: [{ metas: { slug: "note" } }],
};
sharedFake.on("contents", "findUnique", async ({ where }: { where: { cid: number } }) =>
  contentRow && where.cid === 10 ? { ...contentRow } : null);
sharedFake.on("contents", "findFirst", async () => (contentRow ? { ...contentRow } : null));
sharedFake.on("contentrelations", "findFirst", async () => ({ metas: { slug: "note" } }));
sharedFake.on("contentrelations", "findMany", async () => []);

// 站点设置假件:smtp 全配 + adminEmail
sharedFake.on("informations", "findMany", async ({ where }: { where?: { key?: { in: string[] } } }) => {
  const defaults: Record<string, string> = {
    emailPushType: "smtp", smtpHost: "smtp.example.com", smtpPort: "465",
    smtpSecureMode: "ssl", smtpUser: "bot@example.com", smtpPassword: "pw",
    smtpFromName: "测试站", smtpAddress: "noreply@example.com",
    adminEmail: "admin@example.com", notifyAdmin: "true", emailLogEnabled: "false",
    siteName: "测试站", siteUrl: "https://example.com",
  };
  const keys = where?.key?.in ?? [];
  return keys.filter(k => defaults[k] !== undefined).map(k => ({ key: k, value: defaults[k] }));
});

const {
  notifyFriendLinkApplication,
  notifyAdminNewComment,
  notifyCommentReply,
  notifyAdminPendingComment,
} = await import("#server/utils/mail");

beforeEach(() => {
  sentMails.length = 0;
  contentRow = { title: "文章标题", slug: "post-a", type: 0, contentrelations: [{ metas: { slug: "note" } }] };
});

describe("notifyFriendLinkApplication", () => {
  test("申请通知:收件人是站长、主题带站点名、正文转义了网站名", async () => {
    const ok = await notifyFriendLinkApplication('<script>x</script>的站', "https://evil.com", false);
    expect(ok).toBe(true);

    const mail = sentMails[0]!;
    expect(mail.to).toBe("admin@example.com");
    expect(String(mail.subject)).toContain("新的友链申请");
    expect(String(mail.html)).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(String(mail.html)).not.toContain("<script>");
  });

  test("autoApproved 时主题变为已自动添加", async () => {
    await notifyFriendLinkApplication("友链", "https://a.com", true);
    expect(String(sentMails[0]!.subject)).toContain("友链已自动添加");
  });
});

describe("notifyAdminNewComment", () => {
  test("主题带评论者,表情占位符经 MailEmojiRenderer 渲染,附CID附件", async () => {
    const ok = await notifyAdminNewComment(10, "评论者", "好文 :[heo-微笑]", 1);
    expect(ok).toBe(true);

    const mail = sentMails[0]!;
    expect(String(mail.subject)).toContain("评论者");
    expect(String(mail.html)).toContain('src="cid:');
    // 附件表有表情图
    expect(mail.attachments).toBeTruthy();
  });

  test("文章已被删除时仍能发送(标题/链接降级)", async () => {
    contentRow = null;
    const ok = await notifyAdminNewComment(999, "甲", "内容", 1);
    expect(ok).toBe(true);
  });
});

describe("notifyCommentReply / notifyAdminPendingComment", () => {
  test("回复通知可调用", async () => {
    const ok = await notifyCommentReply(10, "被回复人", "parent@x.com", "父评论", "回复者", "回复内容", 2);
    expect(typeof ok).toBe("boolean");
  });

  test("待审通知可调用", async () => {
    const ok = await notifyAdminPendingComment(10, "甲", "待审内容", 0, 5);
    expect(typeof ok).toBe("boolean");
  });
});
