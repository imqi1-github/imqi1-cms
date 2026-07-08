import path from "node:path";

import { prisma } from "#server/utils/prisma";
import { getSubscribePosts } from '#server/utils/rss';
import { parseCovers } from "#server/utils/covers";
import { normalizeAttachmentMetadata } from "#server/utils/attachmentMetadata";
import { renderChangelogContent } from "#server/utils/changelog";

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
  try {
    // 设置缓存头：CDN和浏览器缓存5分钟
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    // ========== 优化：先查询一次图片分类信息，后续复用 ==========
    // 1. 获取站点信息和图片分类slug（一次查询）
    const siteInfoList = await prisma.informations.findMany();
    const infoMap = siteInfoList.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {} as Record<string, string>);

    const photoCategorySlug = infoMap["photoCategorySlug"] || "shot";

    // 2. 获取图片分类的 mid（一次查询）
    const photoCategory = await prisma.metas.findFirst({
      where: { slug: photoCategorySlug },
      select: { mid: true },
    });
    const photoCategoryMid = photoCategory?.mid;

    // ========== 并行获取所有数据（复用上面的查询结果）==========
    const [
      categoriesData,
      recentContentsData,
      categoryRecentContentsData,
      photoContentsData,
      subscribePostsData,
      changelogsData,
    ] = await Promise.all([
      // 1. 获取分类信息（前4个）
      prisma.metas.findMany({
        where: { type: "category" },
        take: 4,
        include: {
          _count: {
            select: { contentrelations: true },
          },
        },
        orderBy: { mid: "asc" },
      }).then(categories =>
        categories.map(cat => ({
          mid: cat.mid,
          name: cat.name,
          slug: cat.slug,
          desc: cat.desc,
          contentCount: cat._count.contentrelations,
        }))
      ),

      // 2. 获取最新6篇文章（排除图片分类）
      prisma.contents.findMany({
        where: {
          type: 0,
          status: 1,
          ...(photoCategoryMid && {
            contentrelations: {
              none: { mid: photoCategoryMid },
            },
          }),
        },
        take: 6,
        orderBy: { create_time: "desc" },
        select: {
          cid: true,
          title: true,
          slug: true,
          desc: true,
          covers: true,
          many_covers: true,
          create_time: true,
          comment_num: true,
          contentrelations: {
            select: {
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
          // 关联的启用地点数（封面角标用）
          travels: {
            where: { travel: { enabled: true } },
            select: { travel_id: true },
          },
        },
      }).then(contents => contents.map(content => {
        const categories = content.contentrelations
          .filter(r => r.metas.type === "category")
          .map(r => ({ name: r.metas.name, slug: r.metas.slug }));

        const tags = content.contentrelations
          .filter(r => r.metas.type === "tag")
          .map(r => ({ name: r.metas.name, slug: r.metas.slug }));

        const covers = parseCovers(content.covers);

        return {
          cid: content.cid,
          title: content.title,
          slug: content.slug,
          desc: content.desc,
          covers,
          many_covers: content.many_covers,
          travelCount: content.travels.length,
          created: content.create_time,
          commentsNum: content.comment_num || 0,
          categories,
          tags,
        };
      })),

      // 3. 获取分类文章（3个分类，每个4篇，排除最新6篇中已展示的）
      (async () => {
        // 先获取最新6篇文章的cid（用于排除）
        const recentContents = await prisma.contents.findMany({
          where: {
            type: 0,
            status: 1,
            ...(photoCategoryMid && {
              contentrelations: {
                none: { mid: photoCategoryMid },
              },
            }),
          },
          take: 6,
          orderBy: { create_time: "desc" },
          select: { cid: true },
        });
        const excludeCids = recentContents.map(p => p.cid);

        const categories = await prisma.metas.findMany({
          where: {
            type: "category",
            ...(photoCategoryMid && { mid: { not: photoCategoryMid } }),
          },
          orderBy: { mid: "asc" },
          take: 3,
          select: { mid: true, name: true, slug: true, desc: true },
        });

        // 为每个分类独立获取最新的4篇文章（排除最新6篇）
        const result = await Promise.all(
          categories.map(async category => {
            const contents = await prisma.contents.findMany({
              where: {
                type: 0,
                status: 1,
                cid: { notIn: excludeCids }, // 排除最新6篇
                contentrelations: {
                  some: { mid: category.mid },
                },
              },
              take: 4,
              orderBy: { create_time: "desc" },
              select: {
                cid: true,
                title: true,
                slug: true,
                desc: true,
                covers: true,
                many_covers: true,
                create_time: true,
                comment_num: true,
                contentrelations: {
                  select: {
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
                // 关联的启用地点数（封面角标用）
                travels: {
                  where: { travel: { enabled: true } },
                  select: { travel_id: true },
                },
              },
            });

            if (contents.length === 0) return null;

            const mappedContents = contents.map(content => {
              const tags = content.contentrelations
                .filter(r => r.metas.type === "tag")
                .map(r => ({ name: r.metas.name, slug: r.metas.slug }));

              const covers = parseCovers(content.covers);

              return {
                cid: content.cid,
                title: content.title,
                slug: content.slug,
                desc: content.desc,
                covers,
                many_covers: content.many_covers,
                travelCount: content.travels.length,
                created: content.create_time,
                commentsNum: content.comment_num || 0,
                tags,
              };
            });

            return {
              category: {
                mid: category.mid,
                name: category.name,
                desc: category.desc,
                slug: category.slug,
              },
              contents: mappedContents,
            };
          })
        );

        return result.filter(r => r !== null);
      })(),

      // 4. 获取图片文章（4篇）
      (async () => {
        if (!photoCategory) return [];

        const contents = await prisma.contents.findMany({
          where: {
            type: 0,
            status: 1,
            contentrelations: {
              some: { mid: photoCategory.mid },
            },
          },
          take: 4,
          orderBy: { create_time: "desc" },
          select: {
            cid: true,
            title: true,
            slug: true,
            covers: true,
            contentrelations: {
              select: {
                metas: {
                  select: {
                    name: true,
                    slug: true,
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
          },
        });

        return contents.map(content => {
          const categories = content.contentrelations.map(r => ({
            name: r.metas.name,
            slug: r.metas.slug,
          }));

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

          return {
            cid: content.cid,
            title: content.title,
            slug: content.slug,
            covers,
            categories,
          };
        });
      })(),

      // 5. 获取订阅文章（3篇）
      getSubscribePosts().then(contents => contents.slice(0, 3)),

      // 6. 获取更新日志（1条）
      prisma.changelogs
        .findMany({
          take: 1,
          orderBy: { create_time: "desc" },
        })
        .then(logs =>
          logs.map(log => ({
            id: log.id,
            content: renderChangelogContent(log.content),
            create_time: log.create_time,
          }))
        ),
    ]);

    // 注意：随机文章已移除（在客户端单独加载，避免ISR缓存导致不随机）

    // 返回所有数据
    return {
      success: true,
      data: {
        site: {
          photoCategorySlug: photoCategorySlug,
        },
        categories: categoriesData,
        recentContents: recentContentsData,
        categoryRecentContents: categoryRecentContentsData,
        photoContents: photoContentsData,
        subscribePosts: subscribePostsData,
        changelogs: changelogsData,
        // randomContent 已移除，改为客户端单独请求
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取首页数据失败",
    });
  }
});
