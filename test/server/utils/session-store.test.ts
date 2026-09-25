import "#test/helpers/nitro-globals";

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

const { MemorySessionStore, FileSessionStore } = await import("#server/utils/session-store");

const DATA = { userId: 1, authCode: "ac", expires: Date.now() + 60_000 };
const EXPIRED = { userId: 2, authCode: "old", expires: Date.now() - 1000 };

// File 分支用临时目录:FileSessionStore 在构造时读 process.cwd()/.sessions
const tmp = mkdtempSync(join(tmpdir(), "session-store-"));
const ORIGINAL_CWD = process.cwd();
process.chdir(tmp);

const fileStore = new FileSessionStore();

afterAll(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(tmp, { recursive: true, force: true });
});

describe("MemorySessionStore", () => {
  const store = new MemorySessionStore();

  test("set/get 往返;过期项 get 时被清除并返回 null", async () => {
    await store.set("m1", { ...DATA });
    expect(await store.get("m1")).toEqual(DATA);

    await store.set("m-exp", { ...EXPIRED });
    expect(await store.get("m-exp")).toBeNull();
    expect(await store.get("m-exp")).toBeNull();
  });

  test("delete 与 clearUserSessions(按 userId 清)", async () => {
    await store.set("s-u1", { userId: 9, authCode: "a", expires: Date.now() + 60_000 });
    await store.set("s-u1-b", { userId: 9, authCode: "b", expires: Date.now() + 60_000 });
    await store.set("s-u2", { userId: 8, authCode: "c", expires: Date.now() + 60_000 });
    await store.clearUserSessions(9);
    expect(await store.get("s-u1")).toBeNull();
    expect(await store.get("s-u1-b")).toBeNull();
    expect(await store.get("s-u2")).toEqual({ userId: 8, authCode: "c", expires: expect.any(Number) });
    await store.delete("s-u2");
    expect(await store.get("s-u2")).toBeNull();
  });

  test("cleanup 清过期留有效", async () => {
    await store.set("c-ok", { ...DATA });
    await store.set("c-exp", { ...EXPIRED });
    await store.cleanup();
    expect(await store.get("c-ok")).not.toBeNull();
    expect(await store.get("c-exp")).toBeNull();
  });
});

describe("FileSessionStore(临时目录)", () => {
  test("set 落盘为 json 文件,get 读回一致", async () => {
    await fileStore.set("f1", { ...DATA });
    expect(existsSync(join(tmp, ".sessions", "f1.json"))).toBe(true);
    expect(await fileStore.get("f1")).toEqual(DATA);
  });

  test("路径穿越:sessionId 含 ../ 被剥成 basename,读不到外部文件", async () => {
    // 真实存在的外部文件(项目根 package.json 的 basename),穿越尝试应被净化
    expect(await fileStore.get("../../package")).toBeNull();
    await fileStore.set("../../evil", { ...DATA });
    // 净化后落盘文件名是 evil.json,且不在临时目录外
    expect(existsSync(join(tmp, ".sessions", "evil.json"))).toBe(true);
    expect(existsSync(join(tmp, "evil.json"))).toBe(false);
  });

  test("delete 删除落盘文件", async () => {
    await fileStore.set("f-del", { ...DATA });
    await fileStore.delete("f-del");
    expect(existsSync(join(tmp, ".sessions", "f-del.json"))).toBe(false);
    await expect(fileStore.delete("f-del")).resolves.toBeUndefined();
  });

  test("cleanup 清过期文件", async () => {
    await fileStore.set("f-exp", { ...EXPIRED });
    await fileStore.cleanup();
    expect(existsSync(join(tmp, ".sessions", "f-exp.json"))).toBe(false);
  });

  test("clearUserSessions 按 userId 清盘上文件", async () => {
    await fileStore.set("f-u7", { userId: 7, authCode: "a", expires: Date.now() + 60_000 });
    await fileStore.set("f-u8", { userId: 8, authCode: "b", expires: Date.now() + 60_000 });
    await fileStore.clearUserSessions(7);
    expect(await fileStore.get("f-u7")).toBeNull();
    expect(await fileStore.get("f-u8")).not.toBeNull();
  });
});
