// admin/api 层测试基建:登录 cookie + 假 event 工厂 + metas 内存表
// users/informations 假件统一在 test/helpers/auth-fakes.ts(全仓唯一注册点,避免跨文件争用)
import "#test/helpers/nitro-globals";

import { mock } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, loginSessionCookie } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

export { CSRF_COOKIE, CSRF_TOKEN, loginSessionCookie };

mockSharedPrisma();
// admin 写接口的缓存失效是 best-effort,统一 mock 掉
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));
// $transaction 双形态:数组(即时执行结果)或回调(传入 fake prisma 本身)
sharedFake.on("$transaction", async (opsOrFn: unknown) =>
  typeof opsOrFn === "function" ? await (opsOrFn as (tx: unknown) => Promise<unknown>)(sharedFake.prisma) : opsOrFn);
// FOR UPDATE 行锁等原生查询:假件里是 no-op
sharedFake.on("$queryRaw", async () => []);

// admin handler 的假 event:cookie + 路由参数 + JSON body(readBody 走 event._requestBody 短路)
export function adminEvent(opts: {
  method?: string;
  params?: Record<string, string>;
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
  url?: string;
}) {
  const reqHeaders: Record<string, string> = { ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(opts.headers ?? {}) };
  if (opts.body !== undefined) reqHeaders["content-type"] = "application/json";
  return {
    method: opts.method ?? "POST",
    context: { params: opts.params ?? {} },
    path: opts.url ?? "/api/admin/x",
    _requestBody: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    node: {
      req: { method: opts.method ?? "POST", url: opts.url ?? "/api/admin/x", headers: reqHeaders },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  } as never;
}

export async function callAdmin(
  handler: (e: never) => unknown,
  opts: Parameters<typeof adminEvent>[0],
): Promise<unknown> {
  return handler(adminEvent(opts) as never);
}

// ===== metas 内存表(tags/categories 域共用):模拟 Prisma 语义(含 P2002/P2025) =====
export interface MetaRow { mid: number; name: string; slug: string | null; desc: string | null; type: string }
// bun test 并发加载文件:handlers 只能在此注册一次,测试用 resetMetas 复位到统一初值
export const metas: MetaRow[] = [];

const prismaError = (code: string) => Object.assign(new Error(code), { code });

export const METAS_INITIAL: MetaRow[] = [
  { mid: 1, name: "标签甲", slug: "tag-a", desc: null, type: "tag" },
  { mid: 2, name: "分类甲", slug: "cat-a", desc: null, type: "category" },
  { mid: 3, name: "标签乙", slug: "tag-b", desc: null, type: "tag" },
];

export function resetMetas(seed: MetaRow[] = METAS_INITIAL): void {
  metas.length = 0;
  metas.push(...seed.map(m => ({ ...m })));
}

// metas 假件注册成可重复调用的函数:测试文件在 beforeEach 里调用以抢占最新注册
// (mock.module 的 handler 表是全进程共享的,后注册者覆盖先注册者)
export function registerMetasFakes(): void {
  resetMetas();
  sharedFake.on("metas", "create", async ({ data }: { data: Omit<MetaRow, "mid"> }) => {
    if (metas.some(m => m.name === data.name || (data.slug && m.slug === data.slug))) throw prismaError("P2002");
    const row = { mid: metas.length + 100, ...data };
    metas.push(row);
    return { ...row };
  });
  sharedFake.on("metas", "updateMany", async ({ where, data }: { where: { mid: number; type: string }; data: Partial<MetaRow> }) => {
    let count = 0;
    for (const m of metas) {
      if (m.mid === where.mid && m.type === where.type) {
        Object.assign(m, data);
        count++;
      }
    }
    return { count };
  });
  sharedFake.on("metas", "findUnique", async ({ where }: { where: { mid: number } }) => {
    const row = metas.find(m => m.mid === where.mid);
    return row ? { ...row } : null;
  });
  sharedFake.on("metas", "findFirst", async ({ where }: { where: Record<string, unknown> }) =>
    metas.find(m =>
      Object.entries(where).every(([k, v]) => {
        if (v === undefined || v === null) return true;
        const actual = (m as unknown as Record<string, unknown>)[k];
        // 支持 Prisma 的 { not } / { in } 过滤(handler 用 mid: { not } 排除自身)
        if (typeof v === "object" && v !== null) {
          const cond = v as { not?: unknown; in?: unknown[] };
          if (cond.not !== undefined) return actual !== cond.not;
          if (cond.in !== undefined) return cond.in.includes(actual);
          return true;
        }
        return actual === v;
      })) ?? null);
  sharedFake.on("metas", "count", async ({ where }: { where: { type: string } }) =>
    metas.filter(m => m.type === where.type).length);
  sharedFake.on("metas", "findMany", async ({ where }: { where: { type?: string; mid?: { in: number[] } } }) =>
    metas
      .filter(m => (where.type === undefined || m.type === where.type))
      .filter(m => (where.mid?.in === undefined || where.mid.in.includes(m.mid)))
      .map(m => ({ ...m, _count: { contentrelations: 3 } })));

  sharedFake.on("metas", "update", async ({ where, data }: { where: { mid: number }; data: Partial<MetaRow> }) => {
    const row = metas.find(m => m.mid === where.mid);
    if (!row) throw prismaError("P2025");
    Object.assign(row, data);
    return { ...row };
  });
  sharedFake.on("metas", "delete", async ({ where }: { where: { mid: number } }) => {
    const i = metas.findIndex(m => m.mid === where.mid);
    if (i === -1) throw prismaError("P2025");
    metas.splice(i, 1);
    return {};
  });
  sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
  sharedFake.on("contentrelations", "findMany", async () => []);
}
