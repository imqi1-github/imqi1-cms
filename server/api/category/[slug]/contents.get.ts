import path from "node:path";

import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";
import { normalizeAttachmentMetadata } from "#server/utils/attachmentMetadata";

const stripUrlDecorations = (value: string) => {
  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = withoutHash.indexOf("?");
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
};

const normalizePathname = (value: string) => {
  const clean = stripUrlDecorations(value);
  try {
    return new URL(clean).pathname;
  } catch {
    return clean;
  }
};

const normalizeObjectKey = (value: string) => {
  return decodeURIComponent(normalizePathname(value).replace(/^\/+/, ""));
};

const buildUrlKeys = (url: string) => {
  const key = normalizeObjectKey(url);
  const candidates = [key];

  if (!key.startsWith("uploads/")) {
    candidates.push(`uploads/${key}`);

    const fileName = path.basename(key);
    const datedName = /^(\d{4})-(\d{2})-\d{2}-/.exec(fileName);
    if (datedName) {
      candidates.push(`uploads/${datedName[1]}/${datedName[2]}/${fileName}`);
    }
  } else {
    candidates.push(key.replace(/^uploads\//, ""));
  }

  const fileName = path.basename(key);
  if (fileName) {
    candidates.push(fileName);
  }

  return new Set(candidates.filter(Boolean));
};

const hasSharedUrlKey = (a: Set<string>, b: Set<string>) => {
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
};

export default defineEventHandler(async event => {
  const categorySlug = getRouterParam(event, 'slug');
  const query = getQuery(event);

  if (!categorySlug) {
    throw createError({
      statusCode: 400,
      message: "分类 slug 不能为空",
    });
  }

  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 12;
  const skip = (page - 1) * pageSize;

  // 获取分类信息
  // metas.slug 全局唯一、分类与标签共用同一张表，必须按 type 过滤，
  // 否则传入某标签的 slug 也会命中它，渲染出「标题=标签名、内容为空」的空壳页而非 404
  const category = await prisma.metas.findFirst({
    where: { slug: categorySlug, type: "category" },
    select: {
      mid: true,
      name: true,
      slug: true,
      desc: true,
    },
  });

  if (!category) {
    throw createError({
      statusCode: 404,
      message: "分类不存在",
    });
  }

  // 获取该分类下的文章总数
  const total = await prisma.contentrelations.count({
    where: {
      metas: {
        slug: categorySlug,
        type: "category",
      },
      content: {
        type: 0, // 0: 文章
        status: 1, // 只统计已发布的文章
      },
    },
  });

  // 获取该分类下的文章列表
  const relations = await prisma.contentrelations.findMany({
    where: {
      metas: {
        slug: categorySlug,
        type: "category",
      },
      content: {
        type: 0, // 0: 文章
        status: 1,
      },
    },
    include: {
      content: {
        include: {
          contentrelations: {
            select: {
              cid: true,
              mid: true,
              metas: {
                select: {
                  name: true,
                  slug: true,
                  type: true,
                },
              },
            },
          },
          attachments: {
            where: {
              attachment: {
                type: "image",
              },
            },
            select: {
              attachment: {
                select: {
                  url: true,
                  metadata: true,
                },
              },
            },
          },
          // 关联的启用地点数（封面角标用）
          travels: {
            where: { travel: { enabled: true } },
            select: { travel_id: true },
          },
        },
      },
    },
    orderBy: {
      content: {
        create_time: 'desc',
      },
    },
    skip,
    take: pageSize,
  });

  // 解析文章数据
  const contents = relations.map(relation => {
    const content = relation.content;

    // 查找评论数量
    const commentsNum = content.comment_num || 0;

    // 解析封面，并用附件 metadata 补齐封面宽高，图片分类瀑布流可提前占位避免布局偏移
    const attachmentMetadata = content.attachments.map(relation => ({
      keys: buildUrlKeys(relation.attachment.url),
      metadata: normalizeAttachmentMetadata(relation.attachment.metadata),
    }));
    const covers = parseCovers(content.covers).map(cover => {
      if (cover.width && cover.height) return cover;

      const coverKeys = buildUrlKeys(cover.url);
      const matched = attachmentMetadata.find(attachment => hasSharedUrlKey(attachment.keys, coverKeys));
      if (!matched) return cover;

      return {
        ...cover,
        width: matched.metadata.width,
        height: matched.metadata.height,
      };
    });

    // 从 contentrelations 中获取标签（只取 type="tag" 的，保留 name + slug）
    const tags = content.contentrelations
      ?.filter(r => r.metas.type === "tag")
      .map(r => ({ name: r.metas.name, slug: r.metas.slug ?? "" })) || [];

    return {
      cid: content.cid,
      title: content.title,
      slug: content.slug,
      desc: content.desc,
      created: content.create_time,
      updated: content.update_time,
      commentsNum,
      many_covers: content.many_covers,
      covers,
      travelCount: content.travels.length,
      tags, // [{ name, slug }]，前端直接用 slug 生成链接
    };
  });

  return {
    success: true,
    data: {
      category,
      contents,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  };
});
