// auth 层测试基建:唯一的 users/informations 假件(admin 与本目录共用,避免跨文件 handler 争用)
// + 带 cookie 读写/方法/入参/对端 IP 的事件工厂
import "#test/helpers/nitro-globals";

import { mock } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

/** 测试用登录凭据(哈希用低 cost 生成,缩短用例耗时) */
export const TEST_PASSWORD = "correct-horse";
const PASSWORD_HASH = await (async () => {
  const { default: bcrypt } = await import("bcryptjs");
  return bcrypt.hash(TEST_PASSWORD, 4);
})();

export interface UserRow {
  uid: number;
  name: string;
  nickname: string | null;
  mail: string | null;
  avatar: string | null;
  password: string;
  auth_code: string;
  totp_secret: string | null;
  totp_enabled: boolean;
}

const users = new Map<number, UserRow>();

/** 重置用户表到初始态(admin/uid=1,未开 2FA);可传覆盖字段 */
export function resetUsers(overrides: Partial<UserRow> = {}): void {
  users.clear();
  users.set(1, {
    uid: 1,
    name: "admin",
    nickname: "阿棋",
    mail: "a@b.c",
    avatar: null,
    password: PASSWORD_HASH,
    auth_code: "",
    totp_secret: null,
    totp_enabled: false,
    ...overrides,
  });
}
resetUsers();

export function getUserRow(uid: number): UserRow | undefined {
  return users.get(uid);
}

export function patchUser(uid: number, patch: Partial<UserRow>): void {
  const row = users.get(uid);
  if (row) Object.assign(row, patch);
}

// 假件只注册一次(进程级):handlers 读的是上面的 Map,测试用 resetUsers 复位
export function registerAuthFakes(): void {
  sharedFake.on("informations", "findUnique", (args: { where: { key: string } }) => {
    if (args.where.key === "sessionStoreType") return { value: "memory" };
    if (args.where.key === "commentAvatarService") return { value: "gravatar" };
    return null;
  });

  sharedFake.on("users", "findUnique", (args: { where: { uid?: number; name?: string; mail?: string }; select?: Record<string, unknown> }) => {
    const { uid, name, mail } = args.where;
    let row: UserRow | undefined;
    if (typeof uid === "number") row = users.get(uid);
    else if (typeof name === "string") row = [...users.values()].find(u => u.name === name);
    else if (typeof mail === "string") row = [...users.values()].find(u => u.mail === mail);
    if (!row) return null;
    // 模拟 Prisma select 投影:handler 声明了 select 时只回这些键(白名单语义由 select 保证)
    if (args.select) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(args.select)) out[key] = (row as unknown as Record<string, unknown>)[key];
      return out;
    }
    return { ...row };
  });

  sharedFake.on("users", "count", () => users.size);

  sharedFake.on("users", "update", (args: { where: { uid: number }; data: Partial<UserRow>; select?: Record<string, unknown> }) => {
    const row = users.get(args.where.uid);
    if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
    Object.assign(row, args.data);
    if (args.select) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(args.select)) out[key] = (row as unknown as Record<string, unknown>)[key];
      return out;
    }
    return { ...row };
  });
}
registerAuthFakes();

// ===== trusted_devices 内存表(login 的免 2FA 判定与 2FA 测试共用) =====
export interface TrustedDeviceRow {
  id: number;
  deviceId: string;
  userId: number;
  name: string | null;
  ip: string | null;
  expiresAt: Date;
  lastUsedAt: Date;
  create_time: Date;
}

let trustedDevices: TrustedDeviceRow[] = [];

export function resetTrustedDevices(seed: TrustedDeviceRow[] = []): void {
  trustedDevices = seed.map(r => ({ ...r }));
}

/** 默认种子:一条有效 + 一条过期(均为 uid 1) */
export function defaultTrustedDeviceSeed(): TrustedDeviceRow[] {
  return [
    { id: 1, deviceId: "dev-live", userId: 1, name: "手机", ip: "1.2.3.4", expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: new Date(), create_time: new Date() },
    { id: 2, deviceId: "dev-expired", userId: 1, name: null, ip: null, expiresAt: new Date(Date.now() - 1000), lastUsedAt: new Date(), create_time: new Date() },
  ];
}
resetTrustedDevices(defaultTrustedDeviceSeed());

function registerTrustedDeviceFakes(): void {
  sharedFake.on("trusted_devices", "upsert", async ({ where, create }: { where: { deviceId: string }; create: Partial<TrustedDeviceRow> }) => {
    const exist = trustedDevices.find(r => r.deviceId === where.deviceId);
    if (exist) return { ...exist };
    const row = { ...create, id: trustedDevices.length + 10 } as TrustedDeviceRow;
    trustedDevices.push(row);
    return { ...row };
  });
  sharedFake.on("trusted_devices", "findUnique", async ({ where }: { where: { deviceId: string } }) => {
    const row = trustedDevices.find(r => r.deviceId === where.deviceId);
    return row ? { ...row } : null;
  });
  sharedFake.on("trusted_devices", "update", async ({ where }: { where: { deviceId: string } }) => ({ ...trustedDevices.find(r => r.deviceId === where.deviceId)! }));
  sharedFake.on("trusted_devices", "findMany", async ({ where }: { where: { userId: number } }) =>
    trustedDevices.filter(r => r.userId === where.userId).map(r => ({ ...r })));
  sharedFake.on("trusted_devices", "deleteMany", async ({ where }: { where: { id: number; userId: number } }) => {
    const before = trustedDevices.length;
    trustedDevices = trustedDevices.filter(r => !(r.id === where.id && r.userId === where.userId));
    return { count: before - trustedDevices.length };
  });
  sharedFake.on("trusted_devices", "updateMany", async ({ where, data }: { where: { id: number; userId: number }; data: { name: string | null } }) => {
    let count = 0;
    for (const r of trustedDevices) {
      if (r.id === where.id && r.userId === where.userId) {
        r.name = data.name ?? null;
        count++;
      }
    }
    return { count };
  });
}
registerTrustedDeviceFakes();

// ===== captcha:真实实现依赖 WASM/字体文件,测试用可控替身 =====
let captchaAccept = true;
export function setCaptchaAccept(v: boolean): void {
  captchaAccept = v;
}
mock.module("#server/utils/captcha", () => ({
  verifyCaptcha: () => captchaAccept,
  issueCaptcha: async () => Buffer.from(""),
}));

// ===== 事件工厂 =====

export interface AuthEventOptions {
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  /** 对端 IP:各用例用不同值,隔离 login-rate-limit 的按 IP 状态 */
  peer?: string;
  params?: Record<string, string>;
  /** 请求 URL(含查询串):getQuery 读 event.path,故 path 与 req.url 都设成它 */
  url?: string;
}

export interface AuthEvent {
  event: never;
  /** 响应 Set-Cookie 头(h3 setCookie 落在这里) */
  setCookies: string[];
  /** 响应普通头(setResponseHeader 落在这里) */
  headers: Record<string, string>;
}

export function makeAuthEvent(opts: AuthEventOptions = {}): AuthEvent {
  const setCookies: string[] = [];
  const headers: Record<string, string> = {};
  const reqHeaders: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookie) reqHeaders.cookie = opts.cookie;
  if (opts.body !== undefined) reqHeaders["content-type"] = "application/json";

  const peer = opts.peer ?? "10.9.0.1";
  const url = opts.url ?? "/api/auth/x";
  const event = {
    method: (opts.method ?? "POST").toUpperCase(),
    context: { params: opts.params ?? {}, clientAddress: peer },
    path: url,
    _requestBody: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    node: {
      req: {
        method: (opts.method ?? "POST").toUpperCase(),
        url,
        headers: reqHeaders,
        socket: { remoteAddress: peer },
      },
      res: {
        setHeader(name: string, value: unknown) {
          const key = String(name).toLowerCase();
          if (key === "set-cookie") setCookies.push(String(value));
          else headers[key] = String(value);
        },
        // h3 追加同类 cookie 时依赖 removeHeader 重排(见 setCookie 的 distinct-key 分支)
        removeHeader(name: string) {
          const key = String(name).toLowerCase();
          if (key === "set-cookie") {
            setCookies.length = 0;
            return;
          }
          Object.keys(headers)
            .filter(k => k === key)
            .forEach(k => Reflect.deleteProperty(headers, k));
        },
        appendHeader(name: string, value: unknown) {
          const key = String(name).toLowerCase();
          if (key === "set-cookie") setCookies.push(String(value));
          else headers[key] = headers[key] ? `${headers[key]}, ${String(value)}` : String(value);
        },
        getHeader(name: string) {
          const key = String(name).toLowerCase();
          return key === "set-cookie" ? setCookies : headers[key];
        },
        getHeaders: () => headers,
      },
    },
  } as never;

  return { event, setCookies, headers };
}

/** 从 Set-Cookie 里抠出某个 cookie 的值 */
export function cookieValue(setCookies: string[], name: string): string | undefined {
  const raw = setCookies.find(c => c.startsWith(`${name}=`));
  return raw?.slice(name.length + 1).split(";")[0];
}

export const CSRF_TOKEN = "c".repeat(20);
export const CSRF_COOKIE = `csrf_token=${CSRF_TOKEN}`;

/** 建一个已登录的会话 cookie(走真实 setSession) */
export async function loginSessionCookie(): Promise<string> {
  const { setSession } = await import("#server/lib/auth");
  const { event, setCookies } = makeAuthEvent();
  await setSession(event, { uid: 1, name: "admin", nickname: "阿棋", mail: "a@b.c", avatar: null });
  return `session=${cookieValue(setCookies, "session")}`;
}
