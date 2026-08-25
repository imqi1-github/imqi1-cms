import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateContentData } from "#server/utils/validation";

export default defineEventHandler(async event => {
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = (await readBody(event)) ?? {};

  const {
    title,
    desc,
    slug,
    content,
    status = 1,
    type = 0,
    manyCovers = false,
    covers,
    showToc = false,
    publishDate,
    csrfToken,
  } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!title) {
    throw createError({
      statusCode: 400,
      message: "标题不能为空",
    });
  }

  // status/type 是 Prisma Int 字段：字符串/布尔/浮点会触发校验错误；归一化为整数并校验取值范围
  const statusNum = Number(status);
  const typeNum = Number(type);
  if (!Number.isInteger(statusNum) || ![0, 1].includes(statusNum)) {
    throw createError({ statusCode: 400, message: "状态无效" });
  }
  if (!Number.isInteger(typeNum) || ![0, 1].includes(typeNum)) {
    throw createError({ statusCode: 400, message: "类型无效" });
  }

  // 验证字段长度
  validateContentData({ title, slug });

  // 创建前检查 slug 唯一（与 PUT 对齐；仅当提供了 slug 时检查）
  if (slug) {
    const slugExists = await prisma.contents.findFirst({
      where: { slug, type: typeNum },
    });
    if (slugExists) {
      throw createError({
        statusCode: 400,
        message: `Slug "${slug}" 已被其他文章使用，请使用不同的 slug`,
      });
    }
  }

  // 处理发布日期：非法字符串会得 Invalid Date，写入 DateTime 字段抛错；校验有效性
  let createTime: Date | undefined = undefined;
  if (publishDate !== undefined && publishDate !== null && publishDate !== "") {
    const d = new Date(publishDate as string);
    if (Number.isNaN(d.getTime())) {
      throw createError({ statusCode: 400, message: "publishDate 格式无效" });
    }
    createTime = d;
  }

  // 创建文章 + （无 slug 时）回填 slug=cid 需原子：否则 create 成功而 update 失败会留下 slug 为空的记录
  const contentRecord = await prisma.$transaction(async tx => {
    const created = await tx.contents.create({
      data: {
        title,
        desc,
        slug: slug || undefined, // 如果没有提供 slug，设为 undefined 让数据库使用默认值
        content,
        status: statusNum,
        type: typeNum,
        many_covers: manyCovers,
        covers,
        show_toc: showToc,
        create_time: createTime,
        update_time: new Date(),
        uid: user.uid, // 设置文章作者为当前登录用户
      },
    });

    // 如果没有提供 slug，使用 cid 作为 slug
    if (!slug) {
      await tx.contents.update({
        where: { cid: created.cid },
        data: { slug: String(created.cid) },
      });
    }

    return created;
  });

  // 前端保存后只需 cid（跳转/关联），不再回查全字段（含正文）。
  return {
    success: true,
    data: { cid: contentRecord.cid },
  };
});
