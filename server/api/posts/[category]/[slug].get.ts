import path from "node:path";

import { prisma } from "#server/utils/prisma";
import { renderMarkdown } from "#server/utils/markdown";
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
  const slug = getRouterParam(event, 'slug');
  const categorySlug = getRouterParam(event, 'category');

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: "文章 slug 不能为空",
    });
  }

  if (!categorySlug) {
    throw createError({
      statusCode: 400,
      message: "分类 slug 不能为空",
    });
  }

  // 构建查询条件
  // uncategorized 是兜底分类：仅匹配「没有任何分类」的文章。
  // 若文章已归属某个分类，则通过 uncategorized 访问视为 404（slug 失效），
  // 避免同一篇文章存在多个详情页 URL。
  const isUncategorized = categorySlug === "uncategorized";
  const post = await prisma.posts.findFirst({
    where: {
      slug,
      type: 0, // 0: 文章
      status: 1, // 只返回已发布的文章 (status: 1 = 已发布)
      ...(isUncategorized
        ? {
            postrelations: {
              none: {
                metas: {
                  type: "category",
                },
              },
            },
          }
        : {
            postrelations: {
              some: {
                metas: {
                  slug: categorySlug,
                  type: "category",
                },
              },
            },
          }),
    },
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
              mid: true,
              name: true,
              slug: true,
              type: true,
            },
          },
        },
      },
      // travels 为 posttravels[] 关联表，过滤启用地点后取 {id,name}
      travels: {
        where: { travel: { enabled: true } },
        select: { travel: { select: { id: true, name: true } } },
      },
      attachments: {
        where: {
          type: "image",
        },
        select: {
          url: true,
          metadata: true,
        },
      },
    },
  });

  if (!post) {
    throw createError({
      statusCode: 404,
      message: "文章不存在",
    });
  }

  // 过滤 postrelations，只保留分类（type = "category"）
  const categoryRelations = post.postrelations.filter(
    relation => relation.metas.type === "category"
  );

  // 过滤出标签关系（type = "tag"）
  const tagRelations = post.postrelations.filter(
    relation => relation.metas.type === "tag"
  );

  // 解析封面 - 支持 JSON 数组或换行分隔格式
  const covers = parseCovers(post.covers);

  // 从 tagRelations 构建标签信息
  const tags = tagRelations.map(relation => ({
    name: relation.metas.name,
    slug: relation.metas.slug,
  }));

  const { attachments, ...postData } = post;
  const attachmentMetadata = attachments.map(attachment => ({
    keys: buildUrlKeys(attachment.url),
    url: attachment.url,
    metadata: normalizeAttachmentMetadata(attachment.metadata),
  }));
  const markdownImages = attachmentMetadata.map(attachment => ({
    url: attachment.url,
    width: attachment.metadata.width,
    height: attachment.metadata.height,
  }));
  const coversWithDimensions = covers.map(cover => {
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

  // 在服务端渲染 Markdown 内容
  const renderedContent = post.content ? await renderMarkdown(post.content) : "";

  return {
    success: true,
    data: {
      ...postData,
      travels: post.travels.map(t => t.travel), // 展平为 [{id,name}]
      postrelations: categoryRelations, // 只返回分类关系
      covers: coversWithDimensions,
      tags,
      markdownImages,
      parsedCovers: coversWithDimensions,
      renderedContent, // 返回已渲染的 HTML
    },
  };
});
