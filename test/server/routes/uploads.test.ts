import "#test/helpers/nitro-globals";

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { afterAll, describe, expect, mock, test } from "bun:test";

// 上传目录指向临时目录:穿越防护/后缀映射/文件流全走真实逻辑
const uploadsDir = mkdtempSync(join(tmpdir(), "uploads-test-"));
writeFileSync(join(uploadsDir, "a.jpg"), "fake-jpeg-bytes");
writeFileSync(join(uploadsDir, "b.unknownext"), "unknown-bytes");
mkdirSync(join(uploadsDir, "subdir"));
// 工厂必须展开真模块全部导出:mock.module 是进程级整体替换,漏导出会打穿别的测试文件
const realAttachmentFile = await import("#server/utils/attachment-file");
mock.module("#server/utils/attachment-file", () => ({
  ...realAttachmentFile,
  // env.UPLOADS_DIR 优先(与真实现语义一致):attachment-file.test 用它指向自己的临时目录
  getUploadsDir: () => {
    const override = process.env.UPLOADS_DIR;
    if (!override) return uploadsDir;
    return isAbsolute(override) ? override : join(process.cwd(), override);
  },
}));

const handler = (await import("#server/routes/uploads/[...path].get")).default as (e: unknown) => Promise<unknown>;

function makeEvent(rawPath: string) {
  const headers: Record<string, string> = {};
  const event = {
    context: { params: { path: rawPath } },
    node: {
      req: { url: `/uploads/${rawPath}`, method: "GET", headers: {} },
      res: {
        headersSent: false,
        statusCode: 200,
        setHeader(name: string, value: string) {
          headers[name.toLowerCase()] = String(value);
        },
        end() {},
        on() {},
        once() {},
        write() {},
      },
    },
  };
  return { event, headers };
}

afterAll(() => {
  rmSync(uploadsDir, { recursive: true, force: true });
});

describe("uploads 路由:目录穿越防护(400)", () => {
  test.each([
    "../etc/passwd",
    "..\\..\\package.json",
    "a/./b",
    "a//b",
    "foo.",
    ".. ",
    "",
  ])("%s → 400 非法路径", async raw => {
    const { event } = makeEvent(raw);
    try {
      await handler(event);
      throw new Error(`应当 400:${raw}`);
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(400);
    }
  });

  test("坏 % 编码(%zz)不抛 500:回退原始路径后按文件查找落到 404", async () => {
    const { event } = makeEvent("%zz");
    try {
      await handler(event);
      throw new Error("应当 404");
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(404);
    }
  });
});

describe("uploads 路由:文件命中与 404", () => {
  test("存在的 jpg 文件返回流,Content-Type/缓存头正确", async () => {
    const { event, headers } = makeEvent("a.jpg");
    await handler(event);
    expect(headers["content-type"]).toBe("image/jpeg");
    expect(headers["cache-control"]).toContain("immutable");
  });

  test("未知后缀回落 octet-stream", async () => {
    const { event, headers } = makeEvent("b.unknownext");
    await handler(event);
    expect(headers["content-type"]).toBe("application/octet-stream");
  });

  test("不存在的文件 404", async () => {
    const { event } = makeEvent("missing.png");
    try {
      await handler(event);
      throw new Error("应当 404");
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(404);
    }
  });

  test("目录请求按非文件处理为 404", async () => {
    const { event } = makeEvent("subdir");
    try {
      await handler(event);
      throw new Error("应当 404");
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(404);
    }
  });
});
