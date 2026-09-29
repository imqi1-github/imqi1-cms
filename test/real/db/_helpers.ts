/**
 * 真实 DB 集成测的 per-test 工具:
 *  - getDb():从 .env 推导的 Prisma 连接串(覆盖 server/utils/prisma.ts 的 env 拼接)
 *  - resetDb():TRUNCATE 全部业务表 CASCADE,reseed admin 用户(与 init-db.sql 种子一致)
 *  - seedAdmin / seedCategory / seedTag / seedContent:最小可用的 fixture
 *  - callDbAdmin:模仿 test/helpers/admin.ts,但用真实 Prisma + 真实 session-store
 *
 * 重要:本文件绝不在模块顶部 import "#server/utils/prisma"。
 * 原因:server/utils/prisma.ts 在模块加载时 new PrismaClient(env),把 client 写进
 * globalThis.prisma。后续被测 handler 加载 server/utils/prisma 时,拿到的是已经
 * 缓存的 client(env 已被本文件改过也救不了)。所以本文件只用自己的 PrismaClient
 * 实例做断言 SELECT;handler 端用的 client 必须在测试文件顶部 setupDb() 改完 env
 * 之后才允许被 import(测试文件 import 顺序必须是 setupDb → helpers → handler)。
 */
import { afterAll, beforeEach } from "bun:test";
import bcrypt from "bcryptjs";

import { setupDb } from "./_setup";

let dbEnvApplied = false;
async function ensureDbEnv() {
  if (dbEnvApplied) return;
  const cfg = await setupDb();
  process.env.DB_NAME = cfg.db;
  dbEnvApplied = true;
}

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");

let prismaSingleton: InstanceType<typeof PrismaClient> | null = null;

export async function getDb() {
  await ensureDbEnv();
  if (prismaSingleton) return prismaSingleton;
  const cfg = await setupDb();
  const connectionString = `postgresql://${cfg.user}:${encodeURIComponent(cfg.password)}@${cfg.host}:${cfg.port}/${cfg.db}`;
  prismaSingleton = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ["error"],
  });
  return prismaSingleton;
}

export async function closeDb() {
  if (prismaSingleton) {
    await prismaSingleton.$disconnect();
    prismaSingleton = null;
  }
}

/** TRUNCATE 全部业务表 CASCADE;reseed admin(沿用 init-db.sql 种子值) */
export async function resetDb(): Promise<void> {
  const db = await getDb();
  // 业务表清单(与 init-db.sql 一致;不含 users 之外的元数据表)
  await db.$executeRawUnsafe(`TRUNCATE TABLE
    "attachments","changelogs","comments","contentattachments","contentrelations","contents",
    "contenttravels","informations","links","metas","subscribeposts","subscribes","travels",
    "trusted_devices","users"
  RESTART IDENTITY CASCADE`);
  // reseed admin(init-db.sql 里的种子:uid=1, name=admin, mail=admin@local)
  const hashed = await bcrypt.hash("test1234", 4);
  await db.users.create({
    data: {
      name: "admin",
      nickname: "站主",
      mail: "admin@local",
      password: hashed,
      auth_code: "",
    },
  });
}

export async function seedCategory(overrides: Partial<{
  name: string; slug: string; desc: string | null; type: "category" | "tag";
}> = {}) {
  const db = await getDb();
  return db.metas.create({
    data: {
      name: overrides.name ?? "测试分类",
      slug: overrides.slug ?? "test-cat",
      type: overrides.type ?? "category",
      ...(overrides.desc !== undefined ? { desc: overrides.desc } : {}),
    },
  });
}

export async function seedContent(overrides: Partial<{
  cid?: number; title?: string; slug?: string; status?: number; type?: number; uid?: number;
}> = {}) {
  const db = await getDb();
  const now = new Date();
  return db.contents.create({
    data: {
      title: overrides.title ?? "测试文章",
      slug: overrides.slug ?? "test-post",
      status: overrides.status ?? 1,
      type: overrides.type ?? 0,
      content: "正文",
      desc: null,
      uid: overrides.uid ?? 1,
      update_time: now,
      create_time: now,
    },
  });
}

export async function seedTag(name = "测试标签", slug = "test-tag") {
  return seedCategory({ name, slug, type: "tag" });
}

// 复制 test/helpers/admin.ts 的事件工厂(不能 import —— 那会触发 mockSharedPrisma
// 污染整个进程的真实 Prisma)。这里写最小可用的纯手工版本。
export interface AdminEvent {
  method: string;
  url: string;
  cookie?: string;
  body?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export function makeDbEvent(opts: AdminEvent) {
  const setCookies: string[] = [];
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const event = {
    method: opts.method.toUpperCase(),
    context: { params: opts.params ?? {}, clientAddress: "127.0.0.1" },
    path: opts.url,
    _requestBody: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    node: {
      req: {
        method: opts.method.toUpperCase(),
        url: opts.url,
        headers,
        socket: { remoteAddress: "127.0.0.1" },
      },
      res: {
        setHeader(name: string, value: unknown) {
          const k = String(name).toLowerCase();
          if (k === "set-cookie") setCookies.push(String(value));
          else headers[k] = String(value);
        },
        appendHeader(name: string, value: unknown) {
          const k = String(name).toLowerCase();
          if (k === "set-cookie") setCookies.push(String(value));
          else headers[k] = headers[k] ? `${headers[k]}, ${String(value)}` : String(value);
        },
        getHeader(name: string) {
          const k = String(name).toLowerCase();
          return k === "set-cookie" ? setCookies : headers[k];
        },
        getHeaders: () => headers,
        removeHeader(name: string) {
          const k = String(name).toLowerCase();
          if (k === "set-cookie") setCookies.length = 0;
        },
      },
    },
  } as never;
  return { event, setCookies, headers };
}

// CSRF:测真实 session-store 时用 setSession 注入 session,csrf_token cookie 由测试自己造
export const CSRF_TOKEN = "test-csrf-token-1234567890";
export const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;

/** 模拟已登录的 admin:写一条 session + csrf cookie 到 setCookies,后续请求带上 */
export async function loginDbCookie(): Promise<string> {
  const { setSession } = await import("#server/lib/auth");
  const { event, setCookies } = makeDbEvent({ method: "POST", url: "/api/auth/x" });
  await setSession(event, { uid: 1, name: "admin", nickname: "站主", mail: "admin@local", avatar: null });
  const sessionVal = setCookies.find(c => c.startsWith("session="))?.slice("session=".length).split(";")[0];
  return `session=${sessionVal}; ${CSRF_COOKIE}`;
}

export async function callDbAdmin<T = unknown>(
  handler: (e: never) => T,
  opts: AdminEvent,
): Promise<T> {
  return handler(makeDbEvent(opts).event as never) as T;
}

// 进程退出钩子:确保断开 Prisma 连接
afterAll(async () => {
  await closeDb();
});

// 模块级 beforeEach 在 bun:test 多文件同进程下行为不稳:
// 各 _helpers.ts 实例的 beforeEach 似乎都被合并,且执行时机不可控,导致跨文件残留。
// 故去掉模块级 beforeEach,各测试文件用 describe.beforeEach(resetDb) 显式注册
// (describe.beforeEach 作用域在该 describe 内,跨文件隔离稳定)。
// 为方便,导出一个工厂 helper:在自己的 describe 内调 registerDbReset(this)。
// 注意:bun:test 的 this 在 describe 回调中即为 describe 上下文。
export function registerDbReset(): void {
  beforeEach(async () => {
    await resetDb();
  });
}

// 调试版:beforeEach 打印 metas 当前行数,排查跨文件残留
export async function _resetDbWithLog(label: string): Promise<void> {
  await resetDb();
  if (process.env.TEST_DEBUG_BEFORE_EACH === "1") {
    const db = await getDb();
    const c = await db.metas.count();
    const u = await db.users.count();
    console.log(`[DBG ${label}] after reset → metas=${c} users=${u}`);
  }
}