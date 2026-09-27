/**
 * server/routes/uploads/[...path].get.ts 集成测(zl-late 版,真附件模块 + 临时上传根):
 *  - 命中文件 → 200 + Content-Type + Cache-Control immutable
 *  - 未知后缀 → octet-stream
 *  - 路径穿越(payload)→ 400
 *  - 不存在文件 → 404
 *  - 目录请求 → 404
 */
import "#test/helpers/nitro-globals";

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { afterAll, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const uploadsDir = mkdtempSync(join(tmpdir(), "uploads-zl-"));
writeFileSync(join(uploadsDir, "a.jpg"), "fake-jpeg");
writeFileSync(join(uploadsDir, "b.unknownext"), "x");
mkdirSync(join(uploadsDir, "subdir"));

// mock getUploadsDir 指向临时目录(env 优先逻辑保留)
const realAttachmentFile = await import("#server/utils/attachment-file");
mock.module("#server/utils/attachment-file", () => ({
  ...realAttachmentFile,
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

describe("uploads zl-late:目录穿越防御(400)", () => {
  // 下面都是路径穿越载荷字面量,不是 import —— 勿改成别名
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
});

describe("uploads zl-late:文件命中与 404", () => {
  test("存在的 jpg → 200 + image/jpeg + immutable 缓存头", async () => {
    const { event, headers } = makeEvent("a.jpg");
    await handler(event);
    expect(headers["content-type"]).toBe("image/jpeg");
    expect(headers["cache-control"]).toContain("immutable");
  });

  test("未知后缀 → octet-stream", async () => {
    const { event, headers } = makeEvent("b.unknownext");
    await handler(event);
    expect(headers["content-type"]).toBe("application/octet-stream");
  });

  test("不存在的文件 → 404", async () => {
    const { event } = makeEvent("missing.png");
    try {
      await handler(event);
      throw new Error("应当 404");
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(404);
    }
  });

  test("目录请求 → 404", async () => {
    const { event } = makeEvent("subdir");
    try {
      await handler(event);
      throw new Error("应当 404");
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(404);
    }
  });
});