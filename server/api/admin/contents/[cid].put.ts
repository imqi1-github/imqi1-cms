import type { Prisma } from "@prisma/client";

import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateContentData } from "#server/utils/validation";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { contentUpdateScopes } from "#server/utils/content-scopes";
import { contentArticlePaths, contentTagMids, contentTaxonomyPaths, relatedContentPagePaths } from "#server/utils/content-urls";
import { logAdminAudit } from "#server/utils/audit";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const cid = Number(getRouterParam(event, 'cid'));
  const body = (await readBody(event)) ?? {};

  const { csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!Number.isInteger(cid) || cid <= 0) {
    throw createError({
      statusCode: 400,
      message: "文章 ID 不合法",
    });
  }

  const {
    title,
    desc,
    slug,
    content,
    status,
    type,
    manyCovers,
    covers,
    showToc,
    publishDate,
    scheduledAt,
  } = body;

  if (!title) {
    throw createError({
      statusCode: 400,
      message: "标题不能为空",
    });
  }

  // 读入字段做 typeof 收窄：非字符串流进 Prisma String 字段会触发校验错误 500；
  // status/type 为 Int 字段需归一化为整数并校验取值范围
  if (typeof title !== 'string') {
    throw createError({ statusCode: 400, message: "标题格式错误" });
  }
  if (desc !== undefined && desc !== null && typeof desc !== 'string') {
    throw createError({ statusCode: 400, message: "简介格式错误" });
  }
  if (content !== undefined && content !== null && typeof content !== 'string') {
    throw createError({ statusCode: 400, message: "内容格式错误" });
  }
  if (slug !== undefined && slug !== null && typeof slug !== 'string') {
    throw createError({ statusCode: 400, message: "slug 格式错误" });
  }
  let statusNum: number | undefined;
  if (status !== undefined) {
    const s = Number(status);
    if (!Number.isInteger(s) || ![0, 1].includes(s)) {
      throw createError({ statusCode: 400, message: "状态无效" });
    }
    statusNum = s;
  }
  let typeNum: number | undefined;
  if (type !== undefined) {
    const t = Number(type);
    if (!Number.isInteger(t) || ![0, 1].includes(t)) {
      throw createError({ statusCode: 400, message: "类型无效" });
    }
    typeNum = t;
  }

  // 验证字段长度
  validateContentData({ title, slug });

  // 检查文章是否存在（连分类/标签关系一起取：改 slug/分类后旧 URL 必须一起失效）
  const existing = await prisma.contents.findUnique({
    where: { cid },
    include: {
      contentrelations: { select: { metas: { select: { mid: true, slug: true, type: true } } } },
    },
  });

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: "文章不存在",
    });
  }

  // 准备更新数据
  const updateData: Prisma.contentsUpdateInput = {
    title,
    desc,
    content,
    ...(statusNum !== undefined && { status: statusNum }),
    ...(typeNum !== undefined && { type: typeNum }),
    many_covers: manyCovers,
    covers,
    show_toc: showToc,
    update_time: new Date(),
    // 如果提供了 publishDate，更新 create_time；非法日期得 Invalid Date 会写入报错，先校验
    ...(publishDate
      ? (() => {
          const d = new Date(publishDate as string);
          if (Number.isNaN(d.getTime())) {
            throw createError({ statusCode: 400, message: "publishDate 格式无效" });
          }
          return { create_time: d };
        })()
      : {}),
    // scheduledAt：「待发布时间」。空字符串/null/undefined = 清除；早于 now 视为立即发布（落 status=1）
    ...(scheduledAt !== undefined
      ? (() => {
          if (scheduledAt === null || scheduledAt === "") {
            return { scheduled_at: null };
          }
          if (typeof scheduledAt !== "string") {
            throw createError({ statusCode: 400, message: "scheduledAt 格式无效" });
          }
          const d = new Date(scheduledAt);
          if (Number.isNaN(d.getTime())) {
            throw createError({ statusCode: 400, message: "scheduledAt 格式无效" });
          }
          // 已过点：调用方若想立即发布不应传 scheduledAt（应传 status=1）；把已过期定时视为清空
          if (d.getTime() <= Date.now()) {
            return { scheduled_at: null };
          }
          return { scheduled_at: d };
        })()
      : {}),
  };

  // 处理 slug：只有当提供了新的 slug 且与当前不同时才更新
  if (slug !== undefined && slug !== null && slug !== existing.slug) {
    // 检查新 slug 是否已被其他文章使用。type 可能随本次请求变更，须用「本次生效类型」而非旧类型校验，
    // 否则类型切换时会在新类型下允许重复 slug
    const effType = typeNum !== undefined ? typeNum : existing.type;
    const slugExists = await prisma.contents.findFirst({
      where: {
        slug,
        type: effType,
        cid: { not: cid }, // 排除当前文章
      },
    });

    if (slugExists) {
      throw createError({
        statusCode: 400,
        message: `Slug "${slug}" 已被其他文章使用，请使用不同的 slug`,
      });
    }

    updateData.slug = slug;
  } else if (!slug && !existing.slug) {
    // 如果当前没有 slug 且没有提供新 slug，使用 cid 作为 slug
    updateData.slug = String(cid);
  }

  try {
    // 更新文章
    await prisma.contents.update({
      where: { cid },
      data: updateData,
    });

    // 按「这次实际改了什么」决定刷哪些页面：只改正文只要刷文章页 1 个 URL
    const oldTagMids = (existing.contentrelations ?? [])
      .filter(relation => relation.metas.type === "tag")
      .map(relation => relation.metas.mid);
    const scopes = contentUpdateScopes(existing, { title, desc, slug, covers, manyCovers, statusNum, typeNum, publishDate });
    // 别人页上的「相关文章」卡片（SSR 内嵌标题/封面/描述）→ 只有卡片字段变了才需要反查
    const relatedPages = scopes.includes("related")
      ? await relatedContentPagePaths(cid, [...oldTagMids, ...await contentTagMids(cid)]).catch(() => [])
      : [];
    void invalidateContentCaches({
      scopes,
      contentCids: [cid],
      // 旧路径一并失效：改了 slug/分类/类型后旧地址仍是边缘缓存里的旧 HTML（内容页 TTL 6 小时）
      contentPaths: [
        ...(scopes.includes("article") ? contentArticlePaths(existing) : []),
        ...(scopes.includes("card") ? contentTaxonomyPaths(existing) : []),
        ...relatedPages,
      ],
    }).catch(err => console.error("[cache] 文章更新失效缓存失败", err));

    // 前端保存后只需 cid，不再回查全字段（含正文）。
    await logAdminAudit({
      actor: { uid: user.uid, name: user.name },
      action: "content.update",
      target: { type: "content", id: cid },
    });
    return {
      success: true,
      data: { cid },
    };
  } catch (error) {
    // 校验抛的 400 原样传递；findUnique 与 update 间的并发删除竞态 → P2025 → 404
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }
    // 并发把 slug 改成已占用值：唯一约束 P2002（预检与 update 间存在 TOCTOU 窗口）→ 400，与 contents.post 对齐
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw createError({ statusCode: 400, message: "slug 已被其他文章使用，请使用不同的 slug" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "更新文章失败" });
  }
});
