/**
 * server/api/mini/comments.post.ts miniComment 构建期开关
 *  - miniCommentsEnabled() === false → 403 "评论功能已关闭"
 *  - 此开关独立于后台 commentEnabled,关闭时直接拦在 getSiteSettings 之前
 *
 * 放 zz-late/ 因为 mock #server/utils/mini-fake-data 是 server util(进程级污染)
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

let miniCommentsEnabledImpl: () => boolean;

beforeEach(() => {
  mock.module("#server/utils/mini-fake-data", () => ({
    miniCommentsEnabled: () => miniCommentsEnabledImpl(),
  }));
});

const { default: commentsPost } = await import("#server/api/mini/comments.post");

function callPost(): Promise<unknown> {
  return (commentsPost as (e: never) => Promise<unknown>)({
    method: "POST",
    path: "/api/mini/comments",
    _requestBody: JSON.stringify({ content: "x" }),
    node: {
      req: { method: "POST", url: "/api/mini/comments", headers: { "content-type": "application/json" } },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  } as never);
}

describe("mini comments.post:miniCommentsEnabled 开关", () => {
  test("miniCommentsEnabled=false → 403 '评论功能已关闭'(不等 getSiteSettings)", async () => {
    miniCommentsEnabledImpl = () => false;
    await expect(callPost()).rejects.toMatchObject({
      statusCode: 403,
      message: "评论功能已关闭",
    });
  });

  test("miniCommentsEnabled=true → 不在 403 拦截(可能因其他校验继续)", async () => {
    miniCommentsEnabledImpl = () => true;
    // body 不合法(captcha 缺失/格式错)可能抛其他错,但绝不是 "评论功能已关闭"
    try {
      await callPost();
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message ?? "";
      expect(msg).not.toBe("评论功能已关闭");
    }
  });
});