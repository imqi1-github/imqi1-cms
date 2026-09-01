import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent, fetch } from "undici";
import type { RequestInit as UndiciRequestInit, Response as UndiciResponse } from "undici";

import { assertPublicHttpUrl, isPrivateIp } from "#server/utils/urlGuard";

/**
 * 服务端外联 fetch 的安全封装（SSRF 防护 + DNS rebinding 封堵）。
 *
 * 背景：`assertPublicHttpUrl` 只做一次「解析 + 校验」，随后调用方若按原始 url fetch，
 * fetch 内部会在连接时刻触发**第二次独立 DNS 解析**——校验与连接之间可插一次 rebinding，
 * 把主机重绑到内网/云元数据地址（169.254.169.254 等）绕过私有段封禁（DNS rebinding TOCTOU）。
 *
 * 本封装用 undici 自定义 dispatcher 把连接**钉定到已校验的公网 IP**：`resolvePublicIps` 解析并过滤，
 * 随后 `Agent.connect.lookup` 固定返回这些 IP，fetch 不再对主机名做二次解析，从而封掉该窗口。
 * 同时统一 `redirect:"error"`、可配 timeout，落地即覆盖 rss.ts / check-link.get.ts / links.post.ts 三个消费方
 * （对照 .claude/memory/ssrf-ipv6-urlguard.md 的「共用同一 fetch 封装」建议）。
 *
 * 注意：`fetch` 必须从 `undici` 包导入（而非全局 fetch）。全局 fetch 由 Node 内置的**另一份** undici 提供，
 * 把本包 `Agent` 实例当 dispatcher 传给它会抛 `UND_ERR_INVALID_ARG: invalid onRequestStart method`
 * （两份 undici 互不兼容），导致所有服务端外联（友链检测/RSS 抓取等）全量失败。
 */

/** 解析 hostname，返回全部公网 IP（IP 字面量直接返回；无公网地址抛 400）。 */
export async function resolvePublicIps(hostname: string): Promise<Array<{ address: string; family: number }>> {
  if (isIP(hostname)) {
    return [{ address: hostname, family: isIP(hostname) }];
  }
  let addresses: Array<{ address: string; family?: number }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw createError({ statusCode: 400, message: "无法解析该域名" });
  }
  return addresses
    .map(a => ({ address: a.address, family: a.family ?? (isIP(a.address) === 6 ? 6 : 4) }))
    .filter(ip => !isPrivateIp(ip.address));
}

/**
 * 对用户提供的 URL 做 SSRF 校验并返回「连接被钉定到已校验公网 IP」的 dispatcher + URL。
 * @throws 400 当 URL 非法 / 解析不出公网 IP。
 */
export async function createPinnedPublicDispatcher(rawUrl: string): Promise<{ agent: Agent; url: URL }> {
  const url = await assertPublicHttpUrl(rawUrl);
  const ips = await resolvePublicIps(url.hostname.replace(/^\[|\]$/g, ""));
  if (ips.length === 0) {
    throw createError({ statusCode: 400, message: "仅允许公网 http/https" });
  }
  const agent = new Agent({
    connect: {
      // 固定返回已校验公网 IP：undici 连接时不再对 hostname 做二次 DNS 解析（封 rebinding）
      lookup: (_hostname, opts, cb) => {
        if (opts?.all) cb(null, ips.map(ip => ({ address: ip.address, family: ip.family })));
        else cb(null, ips[0]!.address, ips[0]!.family);
      },
    },
  });
  return { agent, url };
}

/**
 * 以钉定 IP 的方式 fetch 一个用户提供的 URL，并把完整的响应交给 `process` 消费（在响应体内读取前不关 Agent）。
 * 统一 `redirect:"error"`（30x 到内网会绕过外层校验）与 timeout；`process` 完成后自动关闭 Agent、清 timeout。
 */
export async function fetchPublicUrl<T>(
  rawUrl: string,
  process: (response: UndiciResponse) => Promise<T>,
  init: UndiciRequestInit = {},
  timeoutMs = 10000,
): Promise<T> {
  const { agent, url } = await createPinnedPublicDispatcher(rawUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url.href, {
      ...init,
      redirect: "error",
      signal: controller.signal,
      dispatcher: agent,
    });
    return await process(response);
  } finally {
    clearTimeout(timeoutId);
    await agent.close().catch(() => {});
  }
}
