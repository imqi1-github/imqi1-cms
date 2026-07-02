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
  const category = await prisma.metas.findUnique({
    where: { slug: categorySlug },
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
  const total = await prisma.postrelations.count({
    where: {
      metas: {
        slug: categorySlug,
        type: "category",
      },
      posts: {
        type: 0, // 0: 文章
        status: 1, // 只统计已发布的文章
      },
    },
  });

  // 获取该分类下的文章列表
  const relations = await prisma.postrelations.findMany({
    where: {
      metas: {
        slug: categorySlug,
        type: "category",
      },
      posts: {
        type: 0, // 0: 文章
        status: 1,
      },
    },
    include: {
      posts: {
        include: {
          user: {
            select: {
              uid: true,
              name: true,
              nickname: true,
              avatar: true,
            },
          },
          postrelations: {
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
      posts: {
        create_time: 'desc',
      },
    },
    skip,
    take: pageSize,
  });

  // 解析文章数据
  const posts = relations.map(relation => {
    const post = relation.posts;

    // 查找评论数量
    const commentsNum = post.comment_num || 0;

    // 解析封面，并用附件 metadata 补齐封面宽高，图片分类瀑布流可提前占位避免布局偏移
    const attachmentMetadata = post.attachments.map(relation => ({
      keys: buildUrlKeys(relation.attachment.url),
      metadata: normalizeAttachmentMetadata(relation.attachment.metadata),
    }));
    const covers = parseCovers(post.covers).map(cover => {
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

    // 从 postrelations 中获取标签（只取 type="tag" 的）
    const tagNames = post.postrelations
      ?.filter(r => r.metas.type === "tag")
      .map(r => r.metas.name) || [];

    return {
      cid: post.cid,
      title: post.title,
      slug: post.slug,
      desc: post.desc,
      created: post.create_time,
      updated: post.update_time,
      commentsNum,
      many_covers: post.many_covers,
      covers,
      travelCount: post.travels.length,
      tags: tagNames, // 保持为字符串数组，前端会处理
      user: post.user,
    };
  });

  return {
    success: true,
    data: {
      category,
      posts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  };
});
