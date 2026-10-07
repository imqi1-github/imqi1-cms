/**
 * server/utils/log.ts 单元测：落盘开关 / 行格式 / 大小切分 / 保留清理 / 分片挑选。
 *
 * LOG_DIR 必须在 log.ts 导入前设置（LOG_DIR_RESOLVED 模块加载时解析），指到 tmpdir。
 * siteConfig.logs 直接改对象（log.ts 每次写盘才读值，改完即生效），不用 mock.module——那会全进程泄漏。
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, test } from "bun:test";

const TEST_LOG_DIR = join(tmpdir(), `log-rotation-${process.pid}`);
process.env.LOG_DIR = TEST_LOG_DIR;

const { dateKey, dayShardFiles, flushLogWrites, LOG_DIR_RESOLVED, log } = await import("#server/utils/log");
const { siteConfig } = await import("~~/site.config");

const logsDefaults = JSON.parse(JSON.stringify(siteConfig.logs)) as typeof siteConfig.logs;
afterEach(() => {
  Object.assign(siteConfig.logs, logsDefaults);
  siteConfig.logs.categories = { ...logsDefaults.categories };
});

afterAll(async () => {
  await rm(TEST_LOG_DIR, { recursive: true, force: true });
});

describe("dayShardFiles 分片挑选", () => {
  test("按序号数值升序（.10 排 .2 后），过滤非当天/无关文件", () => {
    const day = "2026-01-01";
    const names = [`${day}.10.log`, `${day}.2.log`, `${day}.log`, "2026-01-02.log", "readme.txt", `${day}.1.log`];
    expect(dayShardFiles(day, names)).toEqual([`${day}.log`, `${day}.1.log`, `${day}.2.log`, `${day}.10.log`]);
  });

  test("无分片返回空数组", () => {
    expect(dayShardFiles("2026-01-01", ["other.log"])).toEqual([]);
  });
});

describe("文件日志落盘", () => {
  test("按行格式写入 {category}/{date}.log：中文标签 + kv 字段", async () => {
    log.app("启动正常", { count: 3 });
    await flushLogWrites();
    const text = await readFile(join(LOG_DIR_RESOLVED, "app", `${dateKey()}.log`), "utf8");
    expect(text).toContain("[应用] [INFO] 启动正常");
    expect(text).toContain("count=3");
    expect(text.endsWith("\n")).toBe(true);
  });

  test("分类开关 false：只打 console 不落盘，其余类别不受影响", async () => {
    siteConfig.logs.categories.audit = false;
    log.audit("不该落盘");
    log.auth("该落盘", { uid: 1 });
    await flushLogWrites();
    await expect(readFile(join(LOG_DIR_RESOLVED, "audit", `${dateKey()}.log`), "utf8")).rejects.toThrow();
    const authText = await readFile(join(LOG_DIR_RESOLVED, "auth", `${dateKey()}.log`), "utf8");
    expect(authText).toContain("该落盘");
  });

  test("总开关 file=false：全部类别不落盘", async () => {
    siteConfig.logs.file = false;
    log.monitor("不该落盘");
    await flushLogWrites();
    await expect(readdir(join(LOG_DIR_RESOLVED, "monitor"))).rejects.toThrow();
  });
});

describe("大小切分", () => {
  test("超 maxFileSizeMb 后切分为 {date}.1.log，行不丢", async () => {
    siteConfig.logs.maxFileSizeMb = 0.0002; // ≈ 210B，三行即触发切分
    const day = dateKey();
    const dir = join(LOG_DIR_RESOLVED, "cron");
    for (let i = 1; i <= 4; i++) log.cron(`任务${i}_${"x".repeat(80)}`);
    await flushLogWrites();
    const names = await readdir(dir);
    expect(names).toContain(`${day}.log`);
    expect(names).toContain(`${day}.1.log`);
    const all = (await Promise.all(names.map(n => readFile(join(dir, n), "utf8")))).join("");
    for (let i = 1; i <= 4; i++) expect(all).toContain(`任务${i}_`);
  });
});

describe("保留清理", () => {
  test("超 retentionDays 的旧日志在新的一天首写时清理，当日分片保留", async () => {
    siteConfig.logs.retentionDays = 30;
    const dir = join(LOG_DIR_RESOLVED, "external");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "2020-01-01.log"), "old\n", "utf8");
    log.external("新一天首写");
    await flushLogWrites();
    const names = await readdir(dir);
    expect(names).not.toContain("2020-01-01.log");
    expect(names.some(n => n.startsWith(`${dateKey()}`))).toBe(true);
  });

  test("retentionDays=0 永久保留", async () => {
    siteConfig.logs.retentionDays = 0;
    const dir = join(LOG_DIR_RESOLVED, "cache");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "2020-01-01.log"), "old\n", "utf8");
    log.cache("触发首写");
    await flushLogWrites();
    expect(await readdir(dir)).toContain("2020-01-01.log");
  });
});
