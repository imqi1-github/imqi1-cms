import type { H3Event } from "h3";

/**
 * 解析客户端 IP。
 *
 * 安全前提：只信「受信代理」转发来的头；非受信对端一律忽略 x-real-ip / x-forwarded-for，
 * 直接用 socket 地址。否则任意客户端可伪造这些头绕过限流键 / 伪造评论入库 IP。
 *
 * 受信判定：对端 IP 为 loopback（本仓库生成式 nginx 就是本机反代，event.context.clientAddress 会是 127.0.0.1/::1），
 * 或在 `TRUSTED_PROXY` 环境变量白名单（逗号分隔，Docker 内网反代场景）。
 *
 * 部署注意：若站点挂在**非 loopback** 的反代（云 LB / docker 网桥 / 远程 nginx）之后，
 * 必须把该反代地址加入 `TRUSTED_PROXY`，否则头被忽略、所有访客 IP 塌缩成反代 IP
 * （评论入库 IP、足迹去重、限流键全部合并成同一个）。
 */
function normalizeIp(v: string): string {
  return v.trim().toLowerCase();
}

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || /^127\./.test(ip);
}

function isTrustedProxy(peer: string): boolean {
  if (!peer) return false;
  if (isLoopback(peer)) return true;
  const allow = (process.env.TRUSTED_PROXY || "")
    .split(",")
    .map((s) => normalizeIp(s))
    .filter(Boolean);
  return allow.includes(normalizeIp(peer));
}

export function getClientIp(event: H3Event): string {
  const peer = normalizeIp(event.context.clientAddress ?? event.node.req.socket.remoteAddress ?? "");

  // 非受信对端（如 node 直连暴露）：头可能被伪造，直接用对端地址，丢弃代理头
  if (!isTrustedProxy(peer)) {
    return peer || "unknown";
  }

  // 受信代理：沿用 x-real-ip → x-forwarded-for 最右段 → 对端 的回退链
  // （右段由最近可信代理追加，左段可被客户端伪造）
  const realIp = getHeader(event, "x-real-ip");
  if (typeof realIp === "string" && realIp.trim().length > 0) {
    return normalizeIp(realIp);
  }

  const xff = getHeader(event, "x-forwarded-for");
  if (typeof xff === "string" && xff.trim().length > 0) {
    const parts = xff.split(",");
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = (parts[i] ?? "").trim();
      if (p.length > 0 && p.toLowerCase() !== "unknown") {
        return normalizeIp(p);
      }
    }
  }

  return peer || "unknown";
}
