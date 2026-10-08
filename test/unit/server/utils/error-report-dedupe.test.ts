/**
 * reportError 邮件通知去重(同 级别+消息 5 分钟一封)+ 无 TTL 残留键自愈
 * (回归:INCR/EXPIRE 间隙崩溃曾会让该类错误永久静音、再也不发通知)。
 * prisma 走共享假件(informations 行喂给 getSiteSettings / getMailConfig),
 * nodemailer 捕获发信;redis 用记录型假件。
 *
 * 刻意不 mock.module "#server/utils/mail" / siteSettings —— mock.module 全进程
 * 泄漏且不可恢复,只导出 sendMail 的假件会把后续文件(如 mail-notify.test)
 * import 到的真实模块一起替换掉。要隔离就隔离更下层:nodemailer / prisma。
 */
import "#test/helpers/nitro-globals";

import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { flushLogWrites } from "#server/utils/log";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

// log.ts 的 logsDir() 每次调用现算,这里指到 tmpdir 防止测试写仓库 logs/
process.env.LOGS_DIR = join(tmpdir(), `error-report-test-${process.pid}`);

mockSharedPrisma();

// informations 行假件: reportError → getSiteSettings / sendMail → getMailConfig 都从这里取
sharedFake.on("informations", "findMany", async ({ where }: { where?: { key?: { in: string[] } } }) => {
  const rows: Record<string, string> = {
    emailPushType: "smtp", smtpHost: "smtp.example.com", smtpPort: "465",
    smtpSecureMode: "ssl", smtpUser: "bot@example.com", smtpPassword: "pw",
    smtpFromName: "测试站", smtpAddress: "noreply@example.com",
    adminEmail: "a@b.c", notifyAdmin: "true", notifyError: "true", siteName: "测试站",
  };
  const keys = where?.key?.in ?? [];
  return keys.filter(k => rows[k] !== undefined).map(k => ({ key: k, value: rows[k] }));
});

// nodemailer 捕获(同 mail-notify.test 的手法)
const mailCalls: string[] = [];
const redisCalls: Array<{ m: string; args: unknown[] }> = [];
const noTtl = new Set<string>();
const counters = new Map<string, number>();

function makeFakeRedis() {
  return {
    async incr(key: string): Promise<number> {
      redisCalls.push({ m: "incr", args: [key] });
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      return n;
    },
    async expire(key: string, sec: number): Promise<number> {
      redisCalls.push({ m: "expire", args: [key, sec] });
      noTtl.delete(key);
      return 1;
    },
    async ttl(key: string): Promise<number> {
      redisCalls.push({ m: "ttl", args: [key] });
      return noTtl.has(key) ? -1 : 300;
    },
  };
}

mock.module("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (opts: { subject?: string }) => {
        mailCalls.push(opts.subject ?? "");
        return { messageId: "ok" };
      },
    }),
  },
}));

mock.module("#server/utils/redis", () => ({ redis: makeFakeRedis() }));

// reportError 里的 log.monitor 写入是异步链: 不等落完就换文件, 会把写入
// 带进下一个测试文件的 LOGS_DIR 里(bun test 共享进程)
afterAll(async () => {
  await flushLogWrites();
});

beforeEach(() => {
  mailCalls.length = 0;
  redisCalls.length = 0;
  noTtl.clear();
  counters.clear();
});

const { reportError } = await import("#server/utils/error-report");

const MSG = "数据库连接失败:boom";

describe("reportError 邮件去重", () => {
  test("首次上报 → 发一封 + incr/expire 各一次", async () => {
    const r = await reportError({ source: "server", level: "error", message: MSG });
    expect(r).toEqual({ notified: true, suppressed: false });
    expect(mailCalls.length).toBe(1);
    expect(redisCalls.filter(c => c.m === "incr" && String(c.args[0]).startsWith("error:notify:")).length).toBe(1);
    expect(redisCalls.filter(c => c.m === "expire").length).toBe(1);
  });

  test("同消息 5 分钟窗口内重复 → suppressed,不再发信", async () => {
    await reportError({ source: "server", level: "error", message: MSG });
    const r2 = await reportError({ source: "server", level: "error", message: MSG });
    expect(r2).toMatchObject({ notified: false, suppressed: true });
    expect(mailCalls.length).toBe(1);
  });

  test("回归:无 TTL 残留键 → 抑制的同时补设窗口,该类错误不会永久静音", async () => {
    await reportError({ source: "server", level: "error", message: MSG });
    // 模拟首次 incr 后、expire 前崩溃:去重键无 TTL
    const key = String(redisCalls.find(c => c.m === "incr")!.args[0]);
    noTtl.add(key);
    const r2 = await reportError({ source: "server", level: "error", message: MSG });
    expect(r2!.suppressed).toBe(true);
    // 自愈:第二次上报把窗口补回去
    expect(redisCalls).toContainEqual({ m: "expire", args: [key, 300] });
    expect(noTtl.has(key)).toBe(false);
  });

  test("不同消息不去重,各自发信", async () => {
    await reportError({ source: "server", level: "error", message: MSG });
    await reportError({ source: "server", level: "error", message: "另一种错误:xyz" });
    expect(mailCalls.length).toBe(2);
  });
});
