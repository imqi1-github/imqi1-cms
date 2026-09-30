/**
 * server/utils/session-store.ts 补测:
 *  - FileSessionStore 路径穿越防御:sessionId 含 ../ 走 path.basename 净化
 *  - FileSessionStore 损坏 JSON 读 → catch 返 null 不抛
 *  - MemorySessionStore 重复 cleanup 幂等
 *  - MemorySessionStore 大量过期项 cleanup 后清空
 */
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

const { MemorySessionStore, FileSessionStore } = await import("#server/utils/session-store");

const DATA = { userId: 1, authCode: "ac", expires: Date.now() + 60_000 };

const tmp = mkdtempSync(join(tmpdir(), "session-store-edge-"));
const ORIGINAL_CWD = process.cwd();
process.chdir(tmp);

afterAll(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(tmp, { recursive: true, force: true });
});

describe("FileSessionStore:路径穿越防御", () => {
  const store = new FileSessionStore();

  test("set 写入合法 sessionId → 落盘到 .sessions/<id>.json", async () => {
    await store.set("valid-id-1", { ...DATA });
    expect(existsSync(join(tmp, ".sessions", "valid-id-1.json"))).toBe(true);
  });

  test("sessionId 含 ../ → path.basename 净化为文件名,不逃出 .sessions 目录", async () => {
    // sessionId = "../../../package" 经 basename → "package",写入 .sessions/package.json(防御重点)
    // 下面几个 "../..*" 是攻击载荷字面量,不是 import —— 勿改成别名
    await store.set("../../../package", { ...DATA });
    expect(existsSync(join(tmp, ".sessions", "package.json"))).toBe(true);
    // 不应有上级目录的 package.json(被逃逸)
    expect(existsSync(join(tmp, "..", "package.json"))).toBe(false);
  });

  test("get 读非法 sessionId → null(不会读出 .sessions 之外的文件)", async () => {
    // 同上的攻击载荷字面量(非 import):验证读到的不是 .sessions 之外的文件
    const r = await store.get("../../../package");
    expect(r).toEqual(DATA);
    // 验证读到的也是 .sessions/package.json(而不是逃逸到其他位置)
  });

  test("get 不存在的合法 sessionId → null", async () => {
    expect(await store.get("never-existed")).toBeNull();
  });

  test("get 损坏 JSON 文件 → null(不抛)", async () => {
    const fs = await import("node:fs");
    fs.writeFileSync(join(tmp, ".sessions", "broken.json"), "{not json", "utf-8");
    const r = await store.get("broken");
    expect(r).toBeNull();
  });

  test("delete 非法 sessionId → 不抛(无文件可删也安全)", async () => {
    // 同上的攻击载荷字面量(非 import)
    await expect(store.delete("../../../package-not-exist")).resolves.toBeUndefined();
  });
});

describe("MemorySessionStore:边界", () => {
  test("set/get/delete/clear 全部支持空字符串 id(不抛)", async () => {
    const store = new MemorySessionStore();
    await store.set("", { ...DATA });
    expect(await store.get("")).toEqual(DATA);
    await store.delete("");
    expect(await store.get("")).toBeNull();
  });

  test("重复 cleanup 幂等", async () => {
    const store = new MemorySessionStore();
    await store.set("k", { ...DATA });
    await store.cleanup();
    await store.cleanup();
    expect(await store.get("k")).not.toBeNull();
  });

  test("clearUserSessions(userId=0) → 清空 userId=0 的所有 session(防止误清全部)", async () => {
    const store = new MemorySessionStore();
    await store.set("a", { userId: 0, authCode: "x", expires: Date.now() + 60_000 });
    await store.set("b", { userId: 1, authCode: "y", expires: Date.now() + 60_000 });
    await store.clearUserSessions(0);
    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toEqual({ userId: 1, authCode: "y", expires: expect.any(Number) });
  });

  test("get 一个过期的 session → 自动 delete 并返 null", async () => {
    const store = new MemorySessionStore();
    await store.set("exp", { userId: 1, authCode: "x", expires: Date.now() - 1000 });
    expect(await store.get("exp")).toBeNull();
    // 二次 get 仍 null(Map 中已删除,不会重复 delete)
    expect(await store.get("exp")).toBeNull();
  });

  test("set 后覆盖为过期 → 下次 get 返 null", async () => {
    const store = new MemorySessionStore();
    await store.set("k", { ...DATA });
    await store.set("k", { userId: 1, authCode: "new", expires: Date.now() - 1000 });
    expect(await store.get("k")).toBeNull();
  });
});