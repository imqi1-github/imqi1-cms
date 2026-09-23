import type {
  MiniArchiveMonthGroup,
  MiniCategory,
  MiniCategoryContent,
  MiniContentDetail,
  MiniLatestContent,
  MiniMusic,
} from "#server/types/apis/mini";
import { formatRelativeTime } from "#server/utils/mini";
import { siteConfig } from "~~/site.config";

/**
 * 小程序「审核模式」的占位数据与开关判定（见 site.config.ts 的 features.miniFakeData）。
 *
 * 开启后 /api/mini/** 全部在**任何 Prisma 查询之前**早返回本文的固定数据：
 * 只呈现一篇占位文章，评论关闭，其余内容一律为空。占位文案要改就改这一个文件。
 */

/** 占位文章 id：假数据模式下唯一可见的 id，其余 id 一律 404 */
export const MINI_FAKE_CONTENT_ID = 1;

/** 占位分类：分类列表只有它，分类详情页只认它的 slug */
export const MINI_FAKE_CATEGORY = {
  mid: 1,
  name: "示例",
  slug: "demo",
  desc: null,
} as const;

const FAKE_TITLE = "示例文章";
const FAKE_DESC = "这是一篇示例文章，用于演示小程序的阅读体验。";

// Markdown 原文（端上自行解析）：含二级标题、段落、列表、行内代码与链接，
// 覆盖轻量解析器的主要分支；不放图片，避免依赖任何外部资源。
const FAKE_MARKDOWN = `## 关于这篇文章

这是一篇示例文章。你可以在列表里点进来，看到排版、段落与列表的展示效果。

小程序里的内容都来自站点接口，本页用于演示阅读页的呈现方式：

- 支持标题与段落
- 支持有序与无序列表
- 支持 \`行内代码\` 与 [链接](https://imqi1.com)

感谢阅读。`;

// 固定发布时间：不用 new Date()，保证同一构建下响应稳定（端上显示也就不会随时钟漂移）
const FAKE_CREATED_DATE = new Date("2026-01-01T00:00:00Z");
const FAKE_CREATED = FAKE_CREATED_DATE.toISOString();
const FAKE_PUBLISHED_AT = formatRelativeTime(FAKE_CREATED_DATE);

/** 首页「最新文章」列表项 */
export const MINI_FAKE_LATEST_CONTENT: MiniLatestContent = {
  id: MINI_FAKE_CONTENT_ID,
  title: FAKE_TITLE,
  cover: "",
  publishedAt: FAKE_PUBLISHED_AT,
  created: FAKE_CREATED,
};

/** 分类列表里的占位分类（contentCount 固定 1，与「只显示一篇」一致） */
export const MINI_FAKE_CATEGORY_ITEM: MiniCategory = {
  ...MINI_FAKE_CATEGORY,
  contentCount: 1,
  cover: "",
  latestTitle: FAKE_TITLE,
};

/** 分类详情页的列表项 */
export const MINI_FAKE_CATEGORY_CONTENT: MiniCategoryContent = {
  id: MINI_FAKE_CONTENT_ID,
  title: FAKE_TITLE,
  cover: "",
  coverCount: 0,
  coverWidth: null,
  coverHeight: null,
  publishedAt: FAKE_PUBLISHED_AT,
  created: FAKE_CREATED,
};

/** 文章详情 */
export const MINI_FAKE_CONTENT: MiniContentDetail = {
  id: MINI_FAKE_CONTENT_ID,
  title: FAKE_TITLE,
  description: FAKE_DESC,
  content: FAKE_MARKDOWN,
  cover: "",
  covers: [],
  categories: [{ mid: MINI_FAKE_CATEGORY.mid, name: MINI_FAKE_CATEGORY.name, slug: MINI_FAKE_CATEGORY.slug }],
  publishedAt: FAKE_PUBLISHED_AT,
  created: FAKE_CREATED,
};

/** 归档：只保留一个分组，内含那篇占位文章 */
export const MINI_FAKE_ARCHIVE: MiniArchiveMonthGroup[] = [
  {
    title: "2026 年 01 月",
    items: [
      {
        id: MINI_FAKE_CONTENT_ID,
        day: "01",
        title: FAKE_TITLE,
        created: FAKE_CREATED,
      },
    ],
  },
];

/** 音乐：list 为空；data 因响应类型非空而给全空字段占位（端上不会播放任何东西） */
export const MINI_FAKE_MUSIC: MiniMusic = {
  name: "",
  artist: "",
  url: "",
  pic: "",
  lrc: "",
};

/** 审核模式是否开启（构建期烘焙，改 site.config.ts 需重新构建） */
export function isMiniFakeDataEnabled(): boolean {
  return siteConfig.features.miniFakeData;
}

/**
 * 小程序评论区是否可用：审核模式下一并关闭。
 * 三个评论相关接口（comments.get / comments.post / messages-config）统一走这里判定。
 */
export function miniCommentsEnabled(): boolean {
  return siteConfig.features.miniComment && !siteConfig.features.miniFakeData;
}
