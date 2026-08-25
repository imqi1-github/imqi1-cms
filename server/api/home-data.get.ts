import { prisma } from "#server/utils/prisma";
import { buildUrlKeys, hasSharedUrlKey } from "#server/utils/cover-keys";
import { getSubscribePosts } from '#server/utils/rss';
import { parseCovers } from "#server/utils/covers";
import { normalizeAttachmentMetadata } from "#server/utils/attachmentMetadata";
import { renderChangelogContent } from "#server/utils/changelog";

export default defineEventHandler(async event => {
  try {
    // 设置缓存头：CDN和浏览器缓存5分钟
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    // ========== 优化：先查询一次图片分类信息，后续复用 ==========
    // 1. 获取图片分类 slug（只读需要的单个 key，避免拉取整张 informations 表）
    const photoCategoryInfo = await prisma.informations.findUnique({
      where: { key: "photoCategorySlug" },
      select: { value: true },
    });
    const photoCategorySlug = (photoCategoryInfo?.value as string) || "shot";

    // 2. 获取图片分类的 mid（一次查询）
    const photoCategory = await prisma.metas.findFirst({
      where: { slug: photoCategorySlug, type: "category" },
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
        select: {
          mid: true,
          name: true,
          slug: true,
          desc: true,
          _count: {
            // 只统计已发布文章(type=0,status=1)，与 tags.get.ts 口径一致，避免把隐藏内容计入可见数。
            select: {
              contentrelations: {
                where: { content: { type: 0, status: 1 } },
              },
            },
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
                  // 同时挂图片分类与普通分类且不在最新6篇的内容，会同时出现在 photoContents 与本分类列表，
                  // 造成首页重复展示。此处按与本分区一致的口径排除图片分类内容。
                  ...(photoCategoryMid && {
                    none: { mid: photoCategoryMid },
                  }),
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
          select: { id: true, content: true, create_time: true },
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
    // 预期 4xx（如校验/未找到）原样抛，不打印完整堆栈
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }
    if (error instanceof Error && 'code' in error && error.code === "P2025") {
      throw createError({
        statusCode: 404,
        message: "数据不存在",
      });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取首页数据失败",
    });
  }
});
