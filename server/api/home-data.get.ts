import { prisma } from "#server/utils/prisma";
import { getSubscribePosts } from '#server/utils/rss';
import MarkdownIt from "markdown-it";

// 创建简化版 Markdown 实例
const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: true,
});

function renderSimpleMarkdown(content: string): string {
  if (!content) return "";
  return md.render(content);
}

export default defineEventHandler(async event => {
  try {
    // 设置缓存头：CDN和浏览器缓存5分钟
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    // 并行获取所有数据
    const [
      siteData,
      categoriesData,
      recentPostsData,
      categoryRecentPostsData,
      photoPostsData,
      subscribePostsData,
      changelogsData,
    ] = await Promise.all([
      // 1. 获取站点信息
      prisma.information.findMany().then(infos => {
        const infoMap = infos.reduce((acc, item) => {
          acc[item.key] = item.value;
          return acc;
        }, {} as Record<string, string>);

        return {
          siteName: infoMap["siteName"] || "ImQi1",
          homeCustomText: infoMap["homeCustomText"] || "<p>做技术的分享者 · 生活的摄影师 · 时事的评论员</p>",
          photoCategorySlug: infoMap["photoCategorySlug"] || "shot",
        };
      }),

      // 2. 获取分类信息（前4个）
      prisma.meta.findMany({
        where: { type: "category" },
        take: 4,
        include: {
          _count: {
            select: { postrelation: true },
          },
        },
        orderBy: { mid: "asc" },
      }).then(categories =>
        categories.map(cat => ({
          mid: cat.mid,
          name: cat.name,
          slug: cat.slug,
          desc: cat.desc,
          postCount: cat._count.postrelation,
        }))
      ),

      // 3. 获取最新6篇文章
      (async () => {
        const photoCategoryMeta = await prisma.information.findUnique({
          where: { key: "photoCategorySlug" },
        });
        const photoCategorySlug = photoCategoryMeta?.value || "shot";

        const photoCategory = await prisma.meta.findFirst({
          where: { slug: photoCategorySlug },
          select: { mid: true },
        });
        const photoCategoryMid = photoCategory?.mid;

        const posts = await prisma.post.findMany({
          where: {
            type: 0,
            status: 1,
            ...(photoCategoryMid && {
              postrelation: {
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
            create_time: true,
            comment_num: true,
            postrelation: {
              select: {
                meta: {
                  select: {
                    mid: true,
                    name: true,
                    slug: true,
                    type: true,
                  },
                },
              },
            },
          },
        });

        return posts.map(post => {
          const categories = post.postrelation
            .filter(r => r.meta.type === "category")
            .map(r => ({ name: r.meta.name, slug: r.meta.slug }));

          const tags = post.postrelation
            .filter(r => r.meta.type === "tag")
            .map(r => ({ name: r.meta.name, slug: r.meta.slug }));

          let covers: { url: string; desc?: string }[] = [];
          if (post.covers) {
            try {
              covers = JSON.parse(post.covers);
            } catch {
              covers = [];
            }
          }

          return {
            cid: post.cid,
            title: post.title,
            slug: post.slug,
            desc: post.desc,
            covers,
            created: post.create_time,
            commentsNum: post.comment_num || 0,
            categories,
            tags,
          };
        });
      })(),

      // 4. 获取分类文章（3个分类，每个4篇）
      (async () => {
        const photoCategoryMeta = await prisma.information.findUnique({
          where: { key: "photoCategorySlug" },
        });
        const photoCategorySlug = photoCategoryMeta?.value || "shot";

        const photoCategory = await prisma.meta.findFirst({
          where: { slug: photoCategorySlug },
          select: { mid: true },
        });
        const photoCategoryMid = photoCategory?.mid;

        const categories = await prisma.meta.findMany({
          where: {
            type: "category",
            ...(photoCategoryMid && { mid: { not: photoCategoryMid } }),
          },
          orderBy: { mid: "asc" },
          take: 3,
          select: { mid: true, name: true, slug: true, desc: true },
        });

        const recentPosts = await prisma.post.findMany({
          where: {
            type: 0,
            status: 1,
            ...(photoCategoryMid && {
              postrelation: {
                none: { mid: photoCategoryMid },
              },
            }),
          },
          take: 6,
          orderBy: { create_time: "desc" },
          select: { cid: true },
        });
        const excludeCids = recentPosts.map(p => p.cid);

        const allPosts = await prisma.post.findMany({
          where: {
            type: 0,
            status: 1,
            cid: { notIn: excludeCids },
            postrelation: {
              some: {
                mid: { in: categories.map(c => c.mid) },
              },
            },
          },
          take: 12,
          orderBy: { create_time: "desc" },
          select: {
            cid: true,
            title: true,
            slug: true,
            desc: true,
            covers: true,
            create_time: true,
            comment_num: true,
            postrelation: {
              select: {
                mid: true,
                meta: {
                  select: {
                    mid: true,
                    name: true,
                    slug: true,
                    type: true,
                  },
                },
              },
            },
          },
        });

        return categories
          .map(category => {
            const categoryPosts = allPosts
              .filter(post => post.postrelation.some(r => r.mid === category.mid))
              .slice(0, 4);

            if (categoryPosts.length === 0) return null;

            const mappedPosts = categoryPosts.map(post => {
              const tags = post.postrelation
                .filter(r => r.meta.type === "tag")
                .map(r => ({ name: r.meta.name, slug: r.meta.slug }));

              let covers: { url: string; desc?: string }[] = [];
              if (post.covers) {
                try {
                  covers = JSON.parse(post.covers);
                } catch {
                  covers = [];
                }
              }

              return {
                cid: post.cid,
                title: post.title,
                slug: post.slug,
                desc: post.desc,
                covers,
                created: post.create_time,
                commentsNum: post.comment_num || 0,
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
              posts: mappedPosts,
            };
          })
          .filter(r => r !== null);
      })(),

      // 5. 获取图片文章（4篇）
      (async () => {
        const photoCategoryMeta = await prisma.information.findUnique({
          where: { key: "photoCategorySlug" },
        });
        const photoCategorySlug = photoCategoryMeta?.value || "shot";

        const photoCategory = await prisma.meta.findFirst({
          where: { slug: photoCategorySlug },
          select: { mid: true },
        });

        if (!photoCategory) return [];

        const posts = await prisma.post.findMany({
          where: {
            type: 0,
            status: 1,
            postrelation: {
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
            postrelation: {
              select: {
                meta: {
                  select: {
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        });

        return posts.map(post => {
          const categories = post.postrelation.map(r => ({
            name: r.meta.name,
            slug: r.meta.slug,
          }));

          let covers: { url: string; desc?: string }[] = [];
          if (post.covers) {
            try {
              const parsed = JSON.parse(post.covers);
              if (Array.isArray(parsed)) {
                covers = parsed.map(item => ({
                  url: item.url || item,
                  desc: item.title || item.desc || "",
                }));
              }
            } catch {
              covers = [];
            }
          }

          return {
            cid: post.cid,
            title: post.title,
            slug: post.slug,
            covers,
            categories,
          };
        });
      })(),

      // 6. 获取订阅文章（3篇）
      getSubscribePosts().then(posts => posts.slice(0, 3)),

      // 7. 获取更新日志（4条）
      prisma.changelog
        .findMany({
          take: 4,
          orderBy: { create_time: "desc" },
        })
        .then(logs =>
          logs.map(log => ({
            id: log.id,
            class: log.class,
            desc: log.desc,
            descHtml: renderSimpleMarkdown(log.desc || ""),
            create_time: log.create_time,
          }))
        ),
    ]);

    // 8. 获取随机文章（需要总文章数）
    const total = await prisma.post.count({
      where: { type: 0, status: 1 },
    });

    let randomPostData = null;
    if (total > 0) {
      const skip = Math.floor(Math.random() * total);
      const posts = await prisma.post.findMany({
        where: { type: 0, status: 1 },
        skip,
        take: 1,
        include: {
          postrelation: {
            select: {
              meta: {
                select: {
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      });

      const post = posts[0];
      if (post) {
        const category = post.postrelation[0]?.meta;

        let covers: { url: string; desc?: string }[] = [];
        if (post.covers) {
          try {
            covers = JSON.parse(post.covers);
          } catch {
            covers = [];
          }
        }

        randomPostData = {
          cid: post.cid,
          title: post.title,
          slug: post.slug,
          desc: post.desc,
          covers,
          category: category
            ? {
                name: category.name,
                slug: category.slug,
              }
            : null,
        };
      }
    }

    // 返回所有数据
    return {
      success: true,
      data: {
        site: siteData,
        categories: categoriesData,
        recentPosts: recentPostsData,
        categoryRecentPosts: categoryRecentPostsData,
        photoPosts: photoPostsData,
        subscribePosts: subscribePostsData,
        changelogs: changelogsData,
        randomPost: randomPostData,
      },
    };
  } catch (error) {
    console.error("获取首页数据失败:", error);
    throw createError({
      statusCode: 500,
      message: "获取首页数据失败",
    });
  }
});
