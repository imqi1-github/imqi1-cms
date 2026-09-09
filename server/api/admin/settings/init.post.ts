import type { Prisma } from "@prisma/client";

import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { siteConfig } from "~~/site.config";

// 默认值配置
const defaults: Record<string, string | number | boolean> = {
  siteName: siteConfig.siteName,
  siteUrl: siteConfig.siteUrl,
  siteDesc: siteConfig.seo.description,
  siteIcp: "",
  homeCustomText: siteConfig.homeCustomText,
  photoCategorySlug: "shot",
  commentEnabled: true,
  commentAvatarService: "gravatar",
  commentPageSize: 10,
  commentMaxLevel: 4,
  commentInterval: 60,
  commentRequireMail: true,
  commentRequireLink: false,
  contentPageSize: 12,
  feedCacheInterval: 8,
  uploadLocation: "local",
};

export default defineEventHandler(async event => {
  if (event.method !== "POST") {
    throw createError({
      statusCode: 405,
      message: "方法不允许",
    });
  }

  // 鉴权 + CSRF 校验（位于下方 try/catch 之外，避免 401/403 被吞成 500）
  const user = await getUser(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = (await readBody(event)) ?? {};
  const { csrfToken } = body;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  try {
    // 获取数据库中已有的配置项
    const existingKeys = await prisma.informations.findMany({
      select: { key: true },
    });

    const existingKeySet = new Set(existingKeys.map(item => item.key));
    // 用 Prisma 生成类型替代内联匿名对象类型（约定4 类型放独立文件）
    const createdItems: Prisma.informationsCreateManyInput[] = [];

    // 找出缺失的配置项
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (!existingKeySet.has(key)) {
        // 将默认值转换为字符串存储
        const stringValue = typeof defaultValue === "boolean" ? (defaultValue ? "true" : "false") : String(defaultValue);

        createdItems.push({ key, value: stringValue });
      }
    }

    // 批量创建缺失的配置项（skipDuplicates：并发初始化撞唯一键时静默跳过，不抛 P2002→500）
    if (createdItems.length > 0) {
      await prisma.informations.createMany({
        data: createdItems,
        skipDuplicates: true,
      });
    }

    // 站点设置初始化 → 影响全站，清空全部 ISR 页面缓存
    void invalidateContentCaches().catch(err => console.error("[cache] 站点设置初始化失效缓存失败", err));

    return {
      success: true,
      message: createdItems.length > 0 ? `已初始化 ${createdItems.length} 个配置项` : "所有配置项已存在",
      data: {
        created: createdItems,
        total: Object.keys(defaults).length,
      },
    };
  } catch (error) {
    // 已带 statusCode 的错误（400/403）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "初始化配置失败",
    });
  }
});
