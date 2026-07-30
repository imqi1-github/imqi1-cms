import { createHash } from "node:crypto";

import { prisma } from "#server/utils/prisma";

// 头像镜像站：评论头像统一在此拼装，保证评论区 / 最近评论等所有展示位使用同一头像源。
const avatarServiceUrls: Record<string, string> = {
  gravatar: "https://www.gravatar.com/avatar",
  cravatar: "https://cn.cravatar.com/avatar",
  weavatar: "https://weavatar.com/avatar",
};

// 读取后台头像镜像设置（commentAvatarService），默认 gravatar。
export async function getCommentAvatarService(): Promise<string> {
  const meta = await prisma.informations.findUnique({ where: { key: "commentAvatarService" } });
  return meta?.value || "gravatar";
}

// 按邮箱 md5 拼接头像镜像 URL；无邮箱返回空串（空串 falsy，前端不渲染 <img>，与评论区一致）。
export function commentAvatarUrl(mail: string | null, service: string): string {
  if (!mail) return "";

  const hash = createHash("md5").update(mail.toLowerCase().trim()).digest("hex");
  const baseUrl = avatarServiceUrls[service] || avatarServiceUrls.gravatar;

  return `${baseUrl}/${hash}?d=identicon&s=80`;
}
