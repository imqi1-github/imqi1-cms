import { beforeEach, describe, expect, test } from "bun:test";

// publicAsset 内部读 import.meta.env.PROD 与 siteConfig.site.cdnUrl;
// cdnUrl 来自 site.config.ts(https://cdn.imqi1.com),测试直接依赖真实配置:
// 仅 PROD=false 时走「未配置 CDN」路径,断言以原路径返回
const { publicAsset } = await import("~/utils/asset");

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  // app 侧 import.meta.env.PROD 在 bun test 下为 false → 走「不加 CDN 前缀」分支
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("publicAsset(开发环境,PROD=false)", () => {
  test("白名单静态资源:保持原路径(不拼 CDN)", () => {
    for (const p of ["/imgs/a.webp", "/skills/x", "/icons/y.svg", "/fonts/f.woff2", "/emojis/e.png", "/uploads/u.jpg"]) {
      expect(publicAsset(p)).toBe(p);
    }
  });

  test("站点级静态文件也在白名单", () => {
    expect(publicAsset("/favicon.ico")).toBe("/favicon.ico");
    expect(publicAsset("/manifest.webmanifest")).toBe("/manifest.webmanifest");
  });

  test("绝对 URL(http/https/协议相对/data:image/blob)原样返回", () => {
    expect(publicAsset("https://cdn.imqi1.com/imgs/a.png")).toBe("https://cdn.imqi1.com/imgs/a.png");
    expect(publicAsset("//cdn.example.com/a.png")).toBe("//cdn.example.com/a.png");
    expect(publicAsset("data:image/png;base64,xxx")).toBe("data:image/png;base64,xxx");
    expect(publicAsset("blob:https://x.com/uuid")).toBe("blob:https://x.com/uuid");
  });

  test("业务路由不加前缀也不是静态资源,原样返回", () => {
    expect(publicAsset("/about")).toBe("/about");
    expect(publicAsset("/api/links")).toBe("/api/links");
  });

  test("非 / 开头的相对路径原样返回", () => {
    expect(publicAsset("relative.png")).toBe("relative.png");
  });

  test("带自定义协议的串被拒(返回空串)", () => {
    expect(publicAsset("javascript:alert(1)")).toBe("");
  });

  test("空值返回空串;raw 选项跳过所有处理", () => {
    expect(publicAsset("")).toBe("");
    expect(publicAsset(null)).toBe("");
    expect(publicAsset(undefined)).toBe("");
    expect(publicAsset("/imgs/a.webp", { raw: true })).toBe("/imgs/a.webp");
  });
});
