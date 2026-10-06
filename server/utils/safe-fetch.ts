import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent, fetch } from "undici";
import type { RequestInit as UndiciRequestInit, Response as UndiciResponse } from "undici";

import { assertPublicHttpUrl, isPrivateIp } from "#server/utils/urlGuard";
import { log } from "#server/utils/log";

/**
 * 服务端外联 fetch 的安全封装（SSRF 防护 + DNS rebinding 封堵）。
 *
 * 背景：`assertPublicHttpUrl` 只做一次「解析 + 校验」，随后调用方若按原始 url fetch，
 * fetch 内部会在连接时刻触发**第二次独立 DNS 解析**——校验与连接之间可插一次 rebinding，
 * 把主机重绑到内网/云元数据地址（169.254.169.254 等）绕过私有段封禁（DNS rebinding TOCTOU）。
 *
 * 本封装用 undici 自定义 dispatcher 把连接**钉定到已校验的公网 IP**：`resolvePublicIps` 解析并过滤，
 * 随后 `Agent.connect.lookup` 固定返回这些 IP，fetch 不再对主机名做二次解析，从而封掉该窗口。
 * 重定向走 `redirect:"manual"`，每跳重新 SSRF 校验 + 重新钉 IP（既允许 www / 协议 / 尾斜杠等
 * 规范化跳转，又不让 30x 把请求引到内网/云元数据）；统一 timeout，落地即覆盖
 * rss.ts / check-link.get.ts / links.post.ts 三个消费方
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
 * 跟随重定向时允许的最大跳数。RSS / 友链页常带 www ↔ 非 www、http → https、尾斜杠等规范化跳转，
 * 5 跳足以覆盖常规场景；超过即视为死循环/可疑投毒。
 */
const MAX_REDIRECTS = 5;

/**
 * 以钉定 IP 的方式 fetch 一个用户提供的 URL，并把完整的响应交给 `process` 消费（在响应体内读取前不关 Agent）。
 *
 * 重定向策略：`redirect:"manual"`，**每跳重新走一次 SSRF 校验 + 重新钉定已校验 IP**（防 DNS rebinding），
 * 这样既允许源站常规的 www / 协议 / 尾斜杠规范化跳转，又不会让 30x 把请求引到内网/云元数据。
 * 跳数上限 MAX_REDIRECTS；跳链在调试日志里完整打印，便于排障。
 */
export async function fetchPublicUrl<T>(
  rawUrl: string,
  process: (response: UndiciResponse) => Promise<T>,
  init: UndiciRequestInit = {},
  timeoutMs = 10000,
): Promise<T> {
  let currentUrl: string = rawUrl;

  for (let hop = 0; ; hop++) {
    const { agent, url } = await createPinnedPublicDispatcher(currentUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.href, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
        dispatcher: agent,
      });

      // 命中 30x：仅取 [301,302,303,307,308] 这五个规范化跳转（308/307 保留方法、303 强制转 GET），
      // 其余状态码视作非重定向，避免被站点用自定义 3xx 投毒
      const status = response.status;
      const location = response.headers.get("location");
      if (status >= 300 && status < 400 && status !== 304 && location) {
        if (hop >= MAX_REDIRECTS) {
          throw new Error(`重定向超过 ${MAX_REDIRECTS} 跳，最后目标：${location}`);
        }
        // 相对路径 Location：相对当前 URL 解析；空 / 非 http(s) 协议一律拒绝
        let nextUrl: string;
        try {
          nextUrl = new URL(location, url.href).href;
        } catch {
          throw new Error(`重定向 Location 非法: ${location}`);
        }
        const probe = new URL(nextUrl);
        if (probe.protocol !== "http:" && probe.protocol !== "https:") {
          throw new Error(`重定向到非 http(s) 协议: ${probe.protocol}`);
        }
        console.log(`[safe-fetch] 重定向 ${hop + 1}/${MAX_REDIRECTS}: ${url.href} -> ${nextUrl}`);
        log.external("fetch.redirect", { hop: hop + 1, from: url.href, to: nextUrl });
        currentUrl = nextUrl;
        continue;
      }

      log.external("fetch.ok", { url: url.href, status, hop });
      return await process(response);
    } finally {
      clearTimeout(timeoutId);
      // 关闭当前 Agent（其内部连接池不再被引用），下一轮循环重新走 SSRF 校验 + IP 钉定
      await agent.close().catch(() => {});
    }
  }
}
