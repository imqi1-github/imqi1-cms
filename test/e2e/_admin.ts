import type { APIRequestContext } from "@playwright/test";

// 默认走 init-db 种子凭据;env 覆盖供 CI / 自定义库使用(避免「密码被改过则整组 skip」)
const SEED_USER = "admin";
const SEED_PASS = "123456";
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? SEED_USER;
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? SEED_PASS;
export { ADMIN_USER, ADMIN_PASS };
// 凭据与库不一致时调用方以此 skip 用例(不修改开发库数据)
export const ADMIN_SKIP_MSG = "admin 凭据与数据库不一致(用户名/密码被改过) — 跳过;可跑 bun run reset:password 重置回默认后重跑";

export async function getCsrfToken(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/csrf/token");
  const json = (await res.json()) as { data?: { token?: string }; token?: string };
  const token = json?.data?.token ?? json?.token ?? "";
  if (!token) throw new Error("获取 CSRF token 失败");
  return token;
}

// admin 登录;传 page.request 可让浏览器 context 继承会话 cookie;注意单端登录会踢现有后台会话
// 返回 true=成功,false=凭据不符/2FA 开启(调用方应 test.skip,不修改开发库数据)
export async function loginAdmin(request: APIRequestContext): Promise<boolean> {
  const csrf = await getCsrfToken(request);
  const res = await request.post("/api/auth/login", {
    data: { username: ADMIN_USER, password: ADMIN_PASS, csrfToken: csrf },
  });
  if (res.status() === 200) return true;

  const body = (await res.json().catch(() => ({}))) as { message?: string; data?: { totpRequired?: boolean; challenge?: boolean } };
  const needsTotp = Boolean(body?.data?.totpRequired || body?.data?.challenge) || (body.message ?? "").includes("两步验证");
  console.warn(`[e2e] admin 登录未成功(HTTP ${res.status()}${needsTotp ? ",已开启两步验证" : ",凭据不符"}),相关用例将跳过 — 可跑 bun run reset:password 重置回默认`);
  return false;
}


// 读取后台 settings(百度审核/SMTP 等凭证存 DB,测试进程只能经 admin 接口取)
export async function getAdminSettings(request: APIRequestContext): Promise<Record<string, unknown>> {
  const res = await request.get("/api/admin/settings");
  if (res.status() !== 200) {
    throw new Error(`settings 读取失败: HTTP ${res.status()}`);
  }
  const json = (await res.json()) as { data?: Record<string, unknown> };
  return json?.data ?? (json as unknown as Record<string, unknown>);
}

// admin 删除(DELETE 走 x-csrf-token header)
export async function adminDelete(request: APIRequestContext, path: string): Promise<void> {
  const csrf = await getCsrfToken(request);
  const res = await request.delete(path, { headers: { "x-csrf-token": csrf } });
  if (res.status() !== 200) {
    throw new Error(`DELETE ${path} 失败: HTTP ${res.status()}`);
  }
}

// 在任意嵌套响应里找满足 match 的对象,返回其 idKey 字段
export function findIdBy(payload: unknown, match: (obj: Record<string, unknown>) => boolean, idKey: string): number | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const r = findIdBy(item, match, idKey);
      if (r !== null) return r;
    }
    return null;
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (match(obj) && typeof obj[idKey] === "number") return obj[idKey];
    for (const v of Object.values(obj)) {
      const r = findIdBy(v, match, idKey);
      if (r !== null) return r;
    }
  }
  return null;
}

// 递归找第一篇 {slug, category} 文章(兼容 category 为字符串或 {slug} 嵌套)
export function findFirstArticle(payload: unknown): { category: string; slug: string; title: string } | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const r = findFirstArticle(item);
      if (r) return r;
    }
    return null;
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.slug === "string") {
      const cat = obj.category;
      const category =
        typeof cat === "string" ? cat : cat && typeof cat === "object" && typeof (cat as { slug?: unknown }).slug === "string" ? (cat as { slug: string }).slug : null;
      if (category) {
        return { category, slug: obj.slug, title: typeof obj.title === "string" ? obj.title : "" };
      }
    }
    for (const v of Object.values(obj)) {
      const r = findFirstArticle(v);
      if (r) return r;
    }
  }
  return null;
}

// 确保 dev 库有一篇可访问文章(无分类/无文章时自动造,数据带 marker 由调用方清理)
// 返回 created=true 时必须配对调用 cleanupArticle;凭据不可用返回 null(调用方 skip)
export async function ensureArticle(request: APIRequestContext): Promise<{ cid: number; category: string; slug: string; title: string; created: boolean } | null> {
  if (!(await loginAdmin(request))) return null;
  const marker = `e2e-article-${Date.now()}`;

  // 分类:复用已有的,没有才建(列表无 type 字段,本身就是纯分类)
  const cats = await (await request.get("/api/admin/categories")).json();
  let mid = findIdBy(cats, o => typeof o.mid === "number", "mid");
  let categorySlug: string | null = null;
  if (mid !== null) {
    const obj = deepFind(cats, o => typeof o.mid === "number" && typeof o.slug === "string");
    categorySlug = (obj?.slug as string) ?? null;
  }
  if (mid === null || !categorySlug) {
    const res = await request.post("/api/admin/categories/create", {
      data: { name: marker, slug: marker, csrfToken: await getCsrfToken(request) },
    });
    if (res.status() !== 200) throw new Error(`创建分类失败: HTTP ${res.status()}`);
    mid = findIdBy(await res.json(), o => o.slug === marker, "mid");
    categorySlug = marker;
  }
  if (mid === null || !categorySlug) throw new Error("分类 mid 解析失败");

  // 文章(响应 { success, data: { cid } },不含 slug)
  const res = await request.post("/api/admin/contents", {
    data: { title: marker, slug: marker, content: "e2e 临时文章正文", status: 1, csrfToken: await getCsrfToken(request) },
  });
  if (res.status() !== 200) throw new Error(`创建文章失败: HTTP ${res.status()}`);
  const body = (await res.json()) as { data?: { cid?: number } };
  const cid = body?.data?.cid ?? null;
  if (cid === null) throw new Error("文章 cid 解析失败");

  // 挂分类(文章页路由 /content/[category]/[slug] 需要)
  const rel = await request.put(`/api/admin/content-categories/${cid}`, {
    data: { categoryIds: [mid], csrfToken: await getCsrfToken(request) },
  });
  if (rel.status() !== 200) throw new Error(`挂分类失败: HTTP ${rel.status()}`);

  return { cid, category: categorySlug, slug: marker, title: marker, created: true };
}

// 清理 ensureArticle(created=true) 造的文章与分类
export async function cleanupArticle(request: APIRequestContext, art: { cid: number; slug: string; created: boolean }): Promise<void> {
  if (!art.created) return;
  try {
    await adminDelete(request, `/api/admin/contents/${art.cid}`);
    const cats = await (await request.get("/api/admin/categories")).json();
    const mid = findIdBy(cats, o => o.slug === art.slug, "mid");
    if (mid !== null) await adminDelete(request, `/api/admin/categories/${mid}`);
  } catch (err) {
    console.warn("[e2e] 文章清理失败(残留 marker):", art.slug, err);
  }
}

// 深度找第一个满足 match 的对象本体
function deepFind(payload: unknown, match: (obj: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const r = deepFind(item, match);
      if (r) return r;
    }
    return null;
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (match(obj)) return obj;
    for (const v of Object.values(obj)) {
      const r = deepFind(v, match);
      if (r) return r;
    }
  }
  return null;
}

// 发评论(公开接口):服务端按 IP 60s 间隔 429(HTTP 200 包 code),自动等待重试;mail 必填
export async function postComment(request: APIRequestContext, data: { cid: number; content: string; name?: string }): Promise<{ code: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const csrf = await getCsrfToken(request);
    const res = await request.post("/api/comments", {
      data: { csrfToken: csrf, name: "e2e-admin", mail: "e2e@example.com", ...data },
    });
    const body = (await res.json()) as { code?: number; message?: string };
    if (body.code === 200) return body as { code: number };
    const wait = body.message?.match(/(\d+) 秒后再试/)?.[1];
    if (body.code === 429 && wait) {
      console.warn(`[e2e] 评论 429,等 ${wait}s 重试`);
      await new Promise(r => setTimeout(r, (Number(wait) + 2) * 1000));
      continue;
    }
    throw new Error(`发评论失败: ${JSON.stringify(body).slice(0, 150)}`);
  }
  throw new Error("发评论失败: 重试耗尽");
}
