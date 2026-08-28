export interface MiniLatestContent {
  id: number;
  title: string;
  cover: string;
  publishedAt: string;
  created: string;
}

export interface MiniLatestContentsResponse {
  success: true;
  data: MiniLatestContent[];
}

export interface MiniArchiveContent {
  id: number;
  day: string;
  title: string;
  created: string;
}

export interface MiniArchiveMonthGroup {
  title: string;
  items: MiniArchiveContent[];
}

export interface MiniArchiveResponse {
  success: true;
  data: MiniArchiveMonthGroup[];
}

export interface MiniCategory {
  mid: number;
  name: string;
  slug: string;
  desc: string | null;
  contentCount: number;
  /** 最新一篇文章的封面（已转绝对地址），无封面时为空串 */
  cover: string;
  /** 最新一篇文章的标题，封面缺失时用作图标文字兜底 */
  latestTitle: string;
}

export interface MiniCategoriesResponse {
  success: true;
  data: MiniCategory[];
}

export interface MiniCategoryContent {
  id: number;
  title: string;
  cover: string;
  coverCount: number;
  coverWidth: number | null;
  coverHeight: number | null;
  publishedAt: string;
  created: string;
}

export interface MiniCategoryPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MiniCategoryContentsData {
  category: {
    mid: number;
    name: string;
    slug: string;
    desc: string | null;
  };
  contents: MiniCategoryContent[];
  pagination: MiniCategoryPagination;
}

export interface MiniCategoryContentsResponse {
  success: true;
  data: MiniCategoryContentsData;
}

export interface MiniContentCategory {
  mid: number;
  name: string;
  /** 分类 slug，用于跳转分类详情页 */
  slug: string;
}

/** 文章封面项：图片地址 + 标题（desc），标题无则为空字符串 */
export interface MiniContentCover {
  url: string;
  title: string;
}

export interface MiniContentDetail {
  id: number;
  title: string;
  /** 文章描述 / 摘要，无则为空字符串 */
  description: string;
  /** Markdown 原文，由小程序端自行解析渲染 */
  content: string;
  /** 首张封面绝对地址，无封面时为空字符串（兼容单封面场景） */
  cover: string;
  /** 全部封面（含标题），可能为空数组 */
  covers: MiniContentCover[];
  /** 文章所属分类，可能为空数组 */
  categories: MiniContentCategory[];
  publishedAt: string;
  created: string;
}

export interface MiniContentDetailResponse {
  success: true;
  data: MiniContentDetail;
}

/** 小程序评论树节点（children 递归嵌套子评论） */
export interface MiniComment {
  /** 评论唯一 id（coid） */
  id: number;
  /** 评论者昵称 */
  name: string;
  /** 评论正文（纯文本，端上直接展示不解析） */
  content: string;
  /** 评论者头像 URL（由 mail 生成的 Gravatar/镜像地址），无邮箱时为空串 */
  avatar: string;
  /** 已格式化好的发布时间文本，如 "3 天前" */
  publishedAt: string;
  /** 原始发布时间 ISO 字符串 */
  created: string;
  /** 父评论作者名，根评论为 null，用作「回复 @某人」展示 */
  parentName: string | null;
  /** 子评论，递归结构 */
  children: MiniComment[];
}

export interface MiniCommentsResponse {
  success: true;
  /** 评论树（仅根评论，子评论在各自 children 内） */
  data: MiniComment[];
  /** 评论总数（含所有层级子评论） */
  total: number;
  /** 是否必填邮箱（跟随主站 commentRequireMail 设置） */
  requireMail: boolean;
  /** 是否必填链接（跟随主站 commentRequireLink 设置） */
  requireLink: boolean;
  /** 小程序评论总开关（features.miniComment），false 时端上整个评论区（含输入框）不展示 */
  commentEnabled: boolean;
}

/** 提交评论的请求体（小程序端） */
export interface MiniCommentBody {
  cid?: number;
  content?: string;
  name?: string;
  mail?: string | null;
  link?: string | null;
  parent_id?: number | null;
  /** 蜜罐字段：人类不会填写，机器人会自动填充 */
  website?: string;
}

/** 提交评论的响应；data.needModeration 为 true 表示进入待审核、暂不展示 */
export interface MiniCommentCreateResponse {
  success: true;
  data: {
    /** 是否需要审核（true 时评论未公开，需站长后台过审） */
    needModeration: boolean;
  };
  message: string;
}

/** 小程序音乐播放数据：url/pic 已解析为真实可播放地址 */
export interface MiniMusic {
  /** 歌曲名 */
  name: string;
  /** 艺术家，多位以 / 连接 */
  artist: string;
  /** 音频真实地址（已解析重定向，端上 innerAudioContext 可直接播放） */
  url: string;
  /** 封面真实地址（已解析重定向），无则为空串 */
  pic: string;
  /** 歌词文本（LRC 原文），无则为空串 */
  lrc: string;
}

export interface MiniMusicResponse {
  success: true;
  /** 歌单第一首（向后兼容旧端；等价于 list[0]） */
  data: MiniMusic;
  /** 完整歌单，每首的 url/pic/lrc 均已解析为真实地址；单曲时仅含一首 */
  list: MiniMusic[];
}

/** 小程序仓库卡片数据：由 /api/mini/repo 代理 GitHub/Gitee API 归一化返回 */
export interface MiniRepo {
  /** 平台：github / gitee */
  platform: "github" | "gitee";
  /** 完整仓库名（owner/repo），拉取失败时回退为传入的 owner/repo */
  fullName: string;
  /** 仓库描述，无则为空串 */
  description: string;
  /** 主语言，无则为空串 */
  language: string;
  /** star 数 */
  stars: number;
  /** fork 数 */
  forks: number;
  /** 是否私有仓库 */
  isPrivate: boolean;
  /** 仓库地址，点击跳转用 */
  url: string;
}

export interface MiniRepoResponse {
  success: true;
  data: MiniRepo;
}

/** GitHub / Gitee 仓库 API 的响应字段（仅取用到的部分） */
export interface RepoApiData {
  full_name?: string;
  name?: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  private?: boolean;
}

/** 足迹关联的文章（点击可跳转文章详情） */
export interface MiniTravelContent {
  /** 文章 id（跳转 /pages/content/detail?id= 用） */
  id: number;
  /** 文章标题 */
  title: string;
  /** 是否图片文章（属于图片分类），端上据此带 photo=1 进入图片版式 */
  photo: boolean;
}

/** 小程序足迹点：一个去过的地方及其关联文章 */
export interface MiniTravel {
  /** 足迹 id */
  id: number;
  /** 地点名称 */
  name: string;
  /** 地点描述，无则为空串 */
  desc: string;
  /** 封面图绝对地址，无则为空串 */
  cover: string;
  /** 该地点关联的文章（仅已发布），可能为空数组 */
  contents: MiniTravelContent[];
}

export interface MiniTravelsResponse {
  success: true;
  data: MiniTravel[];
}

/** 小程序链接项：友链与订阅统一展示为链接 */
export interface MiniLink {
  /** 稳定 key：来源 + 原始 id，如 "link-3" / "subscribe-5" */
  key: string;
  /** 来源：友链 / 订阅 */
  source: "link" | "subscribe";
  /** 昵称 / 站点名 */
  name: string;
  /** 站点地址 */
  url: string;
  /** 头像绝对地址，无则为空串 */
  avatar: string;
}

export interface MiniLinksResponse {
  success: true;
  data: MiniLink[];
}

/** 小程序留言板配置：绑定的文章 id（评论区即留言区） */
export interface MiniMessagesConfigResponse {
  success: true;
  data: {
    /** 留言板关联的文章 id，未配置时为 null */
    contentId: number | null;
    /** 小程序评论总开关（features.miniComment），关闭时留言页与入口都不展示 */
    commentEnabled: boolean;
  };
}

/** 小程序更新日志：单条记录（含多个变更条目） */
export interface MiniChangelogLog {
  /** 记录 id */
  id: number;
  /** 发布时间 ISO 字符串 */
  createTime: string;
  /** 变更条目（type 为「功能」「优化」等类别，value 为内容原文） */
  entries: import("#shared/changelog").ChangelogEntry[];
}

/** 小程序更新日志：按月份分组 */
export interface MiniChangelogGroup {
  year: number;
  month: number;
  logs: MiniChangelogLog[];
}

export interface MiniChangelogsResponse {
  success: true;
  data: MiniChangelogGroup[];
}


