import type { H3Event } from "h3";

// 从请求头/底层 socket 解析客户端 IP。
// 优先级：X-Real-IP（可信代理设置，客户端无法伪造）→ X-Forwarded-For 最右段
//（右段由最近的可信代理追加，左段可被客户端伪造）→ socket 远端地址。
// 取到后 trim；来源缺失或为空/"unknown" 时逐级回退，最终兜底 "unknown"
//（切勿用空串作限流 key——会把所有未知来源归入同一空桶）。
export function getClientIp(event: H3Event): string {
  const realIp = getHeader(event, "x-real-ip");
  if (typeof realIp === "string" && realIp.trim().length > 0) {
    return realIp.trim();
  }

  const xff = getHeader(event, "x-forwarded-for");
  if (typeof xff === "string" && xff.trim().length > 0) {
    const parts = xff.split(",");
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = (parts[i] ?? "").trim();
      if (p.length > 0 && p.toLowerCase() !== "unknown") {
        return p;
      }
    }
  }

  const sock = event.node.req.socket.remoteAddress;
  if (typeof sock === "string" && sock.trim().length > 0) {
    return sock.trim();
  }

  return "unknown";
}
