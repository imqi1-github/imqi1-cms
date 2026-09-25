import "#test/helpers/nitro-globals";

import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

const attachmentFileModule = await import("#server/utils/attachment-file");
const { getPublicDir, getUploadsDir } = attachmentFileModule;

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
});

// deleteAttachmentFile 本地分支(真删 + ENOENT 静默)由 attachment-cleanup.test 经真实现覆盖
// (模块内部调用 getUploadsDir 不经 mock 导出表,此处 env 指向无法生效,故不在此重复)
