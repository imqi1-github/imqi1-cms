import prisma from "#server/utils/prisma";
import { normalizeAttachmentMetadata } from "#server/utils/attachmentMetadata";
import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  try {
    const user = await getUser(event);
    if (!user) {
      throw createError({
        statusCode: 401,
        message: "未登录",
      });
    }

    // 登录可见的读取型接口，禁止被代理/浏览器共享缓存
    setResponseHeader(event, "Cache-Control", "no-store");

    const query = getQuery(event);
    const cidRaw = Number(query.cid);

    if (!Number.isInteger(cidRaw) || cidRaw <= 0) {
      throw createError({
        statusCode: 400,
        message: "缺少文章 ID",
      });
    }
    const cid = cidRaw;

    // 检查文章是否存在
    const content = await prisma.contents.findUnique({
      where: { cid },
      select: { cid: true },
    });

    if (!content) {
      throw createError({
        statusCode: 404,
        message: "文章不存在",
      });
    }

    // 获取附件列表（显式白名单，仅返回消费侧字段，不泄 storage 等内部列）
    const attachments = await prisma.attachments.findMany({
      where: {
        contentattachments: {
          some: { cid },
        },
      },
      orderBy: { create_time: "desc" },
      select: {
        aid: true,
        title: true,
        type: true,
        url: true,
        metadata: true,
        create_time: true,
      },
    });

    return {
      success: true,
      data: attachments.map(a => {
        const metadata = normalizeAttachmentMetadata(a.metadata);
        return {
          id: a.aid,
          name: a.title,
          type: a.type,
          url: a.url,
          size: metadata.size,
          metadata,
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          create_time: a.create_time,
        };
      }),
    };
  } catch (error) {
    console.error(error);

    // 已带 statusCode 的错误（400/403/404，如 createError 抛出的）原样上抛，不吞成 500
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    // Prisma 记录未找到
    if (error && typeof error === "object" && (error as { code?: string }).code === "P2025") {
      throw createError({
        statusCode: 404,
        message: "资源不存在",
      });
    }

    // 未知服务端故障：记录详情，但向前台只回通用 500，勿泄漏 error.message
    throw createError({
      statusCode: 500,
      message: "服务器内部错误",
    });
  }
});
