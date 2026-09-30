import "#test/helpers/nitro-globals";

import { afterEach, describe, expect, test } from "bun:test";

const { getMiniApiSecret } = await import("#server/utils/mini-auth");

const ORIGINAL = process.env.MINI_API_SECRET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MINI_API_SECRET;
  else process.env.MINI_API_SECRET = ORIGINAL;
});

describe("getMiniApiSecret", () => {
  test("读取环境变量;未配置返回空串(调用方 fail-closed)", () => {
    process.env.MINI_API_SECRET = "abc";
    expect(getMiniApiSecret()).toBe("abc");
    delete process.env.MINI_API_SECRET;
    expect(getMiniApiSecret()).toBe("");
  });
});
