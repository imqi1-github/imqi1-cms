import { prisma } from "#server/utils/prisma";

// 上游头像镜像，与主站 informations.commentAvatarService 设置对应。
const serviceUrls: Record<string, string> = {
  gravatar: "https://www.gravatar.com/avatar",
  cravatar: "https://cn.cravatar.com/avatar",
  weavatar: "https://weavatar.com/avatar",
};

/**
 * 小程序头像代理。
 *
 * 小程序正式环境的 request/downloadFile 需要配置合法域名白名单，为避免额外把
 * gravatar/cravatar 等第三方域名加进白名单，评论头像统一走本接口由服务端转发：
 * 端上只请求已白名单的 API 域名，服务端再去拉取上游镜像并回传图片字节。
 *
 * 入参 hash 为评论邮箱的 md5（由 comments 接口生成），s 为尺寸（可选）。
 */
export default defineEventHandler(async event => {
  const query = getQuery(event);
  const hash = String(query.hash || "").toLowerCase();
  const size = Number(query.s) || 80;

  // hash 必须是 32 位十六进制的 md5，防止被当作任意 URL 拼接的 SSRF 跳板。
  if (!/^[a-f0-9]{32}$/.test(hash)) {
    throw createError({ statusCode: 400, message: "非法的头像 hash" });
  }

  // 头像服务与主站共用一份后台设置。
  const avatarSetting = await prisma.informations.findUnique({
    where: { key: "commentAvatarService" },
  });
  const service = avatarSetting?.value || "gravatar";
  const baseUrl = serviceUrls[service] || serviceUrls.gravatar;
  const upstream = `${baseUrl}/${hash}?d=identicon&s=${size}`;

  try {
    const res = await fetch(upstream);
    if (!res.ok) {
      throw createError({ statusCode: 502, message: "上游头像获取失败" });
    }

    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());

    setResponseHeader(event, "Content-Type", contentType);
    // 头像基本不变，长缓存 + CDN 缓存降低回源。
    setResponseHeader(event, "Cache-Control", "public, max-age=86400, s-maxage=86400");

    return buffer;
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    console.error(error);
    throw createError({ statusCode: 502, message: "上游头像获取失败" });
  }
});
