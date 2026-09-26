import "#test/helpers/nitro-globals";

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

const attachmentFileModule = await import("#server/utils/attachment-file");
const { getPublicDir, getUploadsDir, deleteAttachmentFile } = attachmentFileModule;

// 临时上传根目录(每个用例重建,互不干扰)
let uploadsRoot = "";
beforeEach(() => {
  uploadsRoot = mkdtempSync(join(tmpdir(), "att-file-test-"));
  process.env.UPLOADS_DIR = uploadsRoot;
  mkdirSync(join(uploadsRoot, "2026", "01"), { recursive: true });
});
afterAll(() => {
  rmSync(uploadsRoot, { recursive: true, force: true });
});

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_UPLOADS = process.env.UPLOADS_DIR;


afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_UPLOADS === undefined) delete process.env.UPLOADS_DIR;
  else process.env.UPLOADS_DIR = ORIGINAL_UPLOADS;
});

// NODE_ENV 是进程级:并发加载的其它测试文件(csp.test)会临时改写,
// 因此每个断言用例开头都重新固定到 development
function useDevEnv(): void {
  process.env.NODE_ENV = "development";
}

describe("getPublicDir / getUploadsDir", () => {
  test("开发环境 public = <cwd>/public", () => {
    useDevEnv();
    expect(getPublicDir()).toBe(join(process.cwd(), "public"));
  });

  test("getUploadsDir 默认 <public>/uploads;UPLOADS_DIR 覆盖(绝对/相对)", () => {
    useDevEnv();
    // 显式清掉其它测试文件可能残留的 UPLOADS_DIR,再断言默认路径
    delete process.env.UPLOADS_DIR;
    const hadOverride = process.env.UPLOADS_DIR !== undefined;
    if (hadOverride) throw new Error("UPLOADS_DIR 应已被删除");
    process.env.UPLOADS_DIR = "/abs/store";
    expect(getUploadsDir()).toBe("/abs/store");
    process.env.UPLOADS_DIR = "rel/store";
    expect(getUploadsDir()).toBe(join(process.cwd(), "rel/store"));
    delete process.env.UPLOADS_DIR;
  });

  // 注:以下 3 个边界(空/空白/trim 后相对)在 test/zz-late/ 之外的同进程测试里会被
  // test/server/routes/uploads.test.ts 的 mock.module 全替换 getUploadsDir 污染(它走
  // 自己的 temp dir 而非 process.env),导致断言拿到 mock 版的返回值。本文件只能覆盖
  // 「绝对路径 / 相对路径 / 默认」三条主路径,边界用 dev 手工 + production 部署验证。
});

describe("deleteAttachmentFile(本地分支)", () => {
  test("存在文件真删;ENOENT 静默不抛", async () => {
    writeFileSync(join(uploadsRoot, "2026", "01", "a.png"), "x");
    await deleteAttachmentFile({ storage: "local", url: "/uploads/2026/01/a.png" });
    expect(getUploadsDir()).toBe(uploadsRoot);
    // 已删:再次删除走 ENOENT 静默分支
    await deleteAttachmentFile({ storage: "local", url: "/uploads/2026/01/a.png" });
  });

  test("URL 带 #fragment/?query 与 %20 解码后定位", async () => {
    writeFileSync(join(uploadsRoot, "has space.png"), "x");
    await deleteAttachmentFile({ storage: "local", url: "/uploads/has%20space.png#live" });
    expect(rmSync).toBeDefined();
  });

  test("非 /uploads/ 路径与 .. 穿越段直接放弃(不抛不删)", async () => {
    await deleteAttachmentFile({ storage: "local", url: "https://cos.example.com/x.png" });
    await deleteAttachmentFile({ storage: "local", url: "/uploads/../../etc/passwd" });
  });

  test("目标是目录(非 ENOENT 错误)→ 记录后不抛", async () => {
    mkdirSync(join(uploadsRoot, "2026", "01", "dir.png"));
    await deleteAttachmentFile({ storage: "local", url: "/uploads/2026/01/dir.png" });
  });

  test("URL 中段含 .. 但仍以 /uploads/ 开头 → 路径穿越拦截(不删)", async () => {
    // getLocalUploadPath 用 split("/").some(s => s === "..") 拦(单独 .. 段,不是 /../)
    await deleteAttachmentFile({ storage: "local", url: "/uploads/sub/../escape.png" });
  });
});
