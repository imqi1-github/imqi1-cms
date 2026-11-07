/**
 * MCP 端点的响应写出（writeWebResponse）。
 *
 * 两个要点：
 *  1. **显式 no-store**：边缘策略是「跟随源站」⇒ 源站说不缓存边缘就不缓存。
 *     不依赖 SDK 顺带发的 no-cache —— SDK 换实现、将来返回 JSON、控制台改成「强制 TTL」
 *     这三种情况下这个头都是最后一道保险。
 *  2. **响应已发出时不再设 header**：否则 Node 抛 ERR_HTTP_HEADERS_SENT
 *     （"Cannot set headers after they are sent to the client"）⇒ 请求变 500 + 错误邮件。
 */
import { describe, expect, test } from "bun:test";
import "#test/helpers/nitro-globals";
import type { H3Event } from "h3";

import { writeWebResponse } from "#server/routes/mcp.post";

/** 造一个最小可用的 node res 桩：记录 header、记录是否已结束 */
function fakeEvent(): { event: H3Event; headers: Record<string, string>; ended: () => boolean } {
  const headers: Record<string, string> = {};
  let ended = false;
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(key: string, value: string) {
      headers[key.toLowerCase()] = value;
    },
    end() {
      ended = true;
      res.headersSent = true;
    },
  };
  const event = { node: { res } } as unknown as H3Event;
  return { event, headers, ended: () => ended };
}

describe("MCP 响应写出", () => {
  test("显式下发 cache-control: no-store（不依赖 SDK 顺带发的 no-cache）", async () => {
    const { event, headers } = fakeEvent();
    // 不带任何 cache-control 的 Response：模拟 SDK 行为变化的情况
    await writeWebResponse(event, new Response("data: {}\n\n", {
      headers: { "content-type": "text/event-stream" },
    }));
    expect(headers["cache-control"]).toBe("no-store");
  });

  test("no-store 覆盖 SDK 自带的 no-cache（语义更强：不要存而非每次验证）", async () => {
    const { event, headers } = fakeEvent();
    await writeWebResponse(event, new Response("data: {}\n\n", {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" },
    }));
    expect(headers["cache-control"]).toBe("no-store");
  });

  test("正常路径：状态码与 body 都写出去", async () => {
    const { event, headers, ended } = fakeEvent();
    await writeWebResponse(event, new Response("data: {}\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    expect(event.node.res.statusCode).toBe(200);
    expect(headers["content-type"]).toBe("text/event-stream");
    expect(ended()).toBe(true);
  });

  test("响应已发出时跳过设 header，不抛 ERR_HTTP_HEADERS_SENT", async () => {
    const { event, headers } = fakeEvent();
    // 模拟：上游已经把响应写出去了
    (event.node.res as unknown as { headersSent: boolean }).headersSent = true;
    await writeWebResponse(event, new Response("data: {}\n\n", {
      headers: { "content-type": "text/event-stream" },
    }));
    // 没有设成 header，也没有抛错
    expect(headers["content-type"]).toBeUndefined();
    expect(headers["cache-control"]).toBeUndefined();
  });
});
