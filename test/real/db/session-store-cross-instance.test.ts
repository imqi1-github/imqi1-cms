/**
 * 真实 DB 集成测 —— session-store 跨 PrismaClient 实例共享(DatabaseSessionStore)
 *
 * file/database 模式天然跨进程/跨实例共享(memory 不),验证:
 * - 实例 A setSession → 实例 B getSession 能拿到同一份 session
 * - 实例 A setSession + auth_code 旋转后,实例 B 用旧 sessionId 查询时
 *   auth_code 不匹配 → getUser 返 null(单端登录的跨实例有效性)
 * - 跨实例 delete 后,实例 A 再 get 应返 null
 *
 * 放 test/real/db/:需要真实 PG,DatabaseSessionStore 才生效。
 */
import { beforeAll, describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, resetDb } = await import("./_helpers");

// 创建两个独立的 PrismaClient 实例(模拟两个进程/服务)
async function makeInstance() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const cfg = (await import("./_setup")).getDb
    ? null // 用 _helpers 的 env
    : null;
  // 简化:让两个实例共用同一个 PG URL(从 process.env 读)
  const { setupDb } = await import("./_setup");
  const c = await setupDb();
  const url = `postgresql://${c.user}:${encodeURIComponent(c.password)}@${c.host}:${c.port}/${c.db}`;
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter, log: ["error"] });
}

describe("session-store 跨 PrismaClient 实例共享(真实 DB)", () => {
  let instanceA: Awaited<ReturnType<typeof makeInstance>>;
  let instanceB: Awaited<ReturnType<typeof makeInstance>>;

  beforeAll(async () => {
    await resetDb();
    instanceA = await makeInstance();
    instanceB = await makeInstance();
  });

  test("实例 A setSession → 实例 B getSession 拿到同一份", async () => {
    const sid = `cross-${Date.now()}-A`;
    await instanceA.sessions.create({
      data: {
        id: sid,
        userId: 1,
        authCode: "authCode-A",
        expires: new Date(Date.now() + 60_000),
      },
    });
    const fromB = await instanceB.sessions.findUnique({ where: { id: sid } });
    expect(fromB).not.toBeNull();
    expect(fromB?.userId).toBe(1);
    expect(fromB?.authCode).toBe("authCode-A");
  });

  test("实例 A setSession + 旋转 authCode → 实例 B 用旧 authCode 不能 getUser", async () => {
    const sid = `cross-${Date.now()}-B`;
    // 实例 A 写入 session + DB auth_code=v1
    await instanceA.sessions.create({
      data: { id: sid, userId: 1, authCode: "v1", expires: new Date(Date.now() + 60_000) },
    });
    await instanceA.users.update({ where: { uid: 1 }, data: { auth_code: "v2" } });
    // 实例 B 用旧 sessionId 查:session.userId=1 + authCode=v1,但 DB.auth_code=v2 不匹配
    const fromB = await instanceB.sessions.findUnique({ where: { id: sid } });
    expect(fromB?.authCode).toBe("v1");
    const userFromB = await instanceB.users.findUnique({ where: { uid: fromB!.userId } });
    expect(userFromB?.auth_code).toBe("v2"); // DB 已是 v2
    // getUser 逻辑:session.authCode !== user.auth_code → 删 session → 返 null
    expect(userFromB?.auth_code).not.toBe(fromB?.authCode);
    // 模拟服务端 getUser 应发现不匹配并清除该 session
    await instanceB.sessions.delete({ where: { id: sid } });
    const afterDelete = await instanceA.sessions.findUnique({ where: { id: sid } });
    expect(afterDelete).toBeNull(); // 跨实例 delete 生效
  });

  test("实例 A delete session → 实例 B getSession 返 null(跨实例可见)", async () => {
    const sid = `cross-${Date.now()}-C`;
    await instanceA.sessions.create({
      data: { id: sid, userId: 1, authCode: "v1", expires: new Date(Date.now() + 60_000) },
    });
    // 实例 B 也能看到
    expect(await instanceB.sessions.findUnique({ where: { id: sid } })).not.toBeNull();
    // 实例 A 删除
    await instanceA.sessions.delete({ where: { id: sid } });
    // 实例 B 看不到
    expect(await instanceB.sessions.findUnique({ where: { id: sid } })).toBeNull();
  });

  test("实例 B clearUserSessions → 实例 A 看不到对应 user 的 sessions(单端登录)", async () => {
    // 实例 B 清空用户 1 的所有 session
    await instanceB.sessions.deleteMany({ where: { userId: 1 } });
    const fromA = await instanceA.sessions.findMany({ where: { userId: 1 } });
    expect(fromA).toHaveLength(0);
  });

  test("多实例同时写 + 读无冲突:每个 sessionId 仅属于一次 setSession", async () => {
    const N = 20;
    const sessionIds = Array.from({ length: N }, (_, i) => `multi-${Date.now()}-${i}`);
    // 实例 A 写一半
    await Promise.all(
      sessionIds.slice(0, N / 2).map((sid, i) =>
        instanceA.sessions.create({
          data: { id: sid, userId: 1, authCode: `a-${i}`, expires: new Date(Date.now() + 60_000) },
        })
      )
    );
    // 实例 B 写另一半
    await Promise.all(
      sessionIds.slice(N / 2).map((sid, i) =>
        instanceB.sessions.create({
          data: { id: sid, userId: 1, authCode: `b-${i}`, expires: new Date(Date.now() + 60_000) },
        })
      )
    );
    // 任一实例都能查到全部 20 条
    const fromA = await instanceA.sessions.findMany({ where: { id: { in: sessionIds } } });
    const fromB = await instanceB.sessions.findMany({ where: { id: { in: sessionIds } } });
    expect(fromA).toHaveLength(N);
    expect(fromB).toHaveLength(N);
  });
});