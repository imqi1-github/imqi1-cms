import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { siteConfig } from "../../site.config";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  connectionLimit: 10,
});

const prisma = new PrismaClient({
  adapter,
});

// ============================================
// 生产环境种子数据配置
// ============================================

/**
 * 网站元数据配置
 */
const SITE_META = {
  siteName: siteConfig.siteName,
  siteUrl: siteConfig.siteUrl,
  siteDesc: siteConfig.seo.description,
  siteIcp: "",
  commentEnabled: "true",
  commentModeration: "false",
  commentAvatarService: "gravatar",
  commentPageSize: "10",
  commentMaxLevel: "4",
  commentRequireMail: "true",
  commentRequireLink: "false",
  commentInterval: "60",
  postPageSize: "12",
  homeCustomText: siteConfig.homeCustomText,
  musicPlaylistId: "9255074836 || netease",
  photoCategorySlug: "shot",
  moderationApiType: "1",
  baiduAppId: "",
  baiduApiKey: "",
  baiduSecretKey: "",
  baiduCheckAdmin: "false",
  emailLogEnabled: "true",
  emailPushType: "none",
  smtpHost: "",
  smtpUser: "",
  smtpAddress: "",
  smtpPassword: "",
  smtpSecureMode: "tls",
  smtpPort: "465",
  smtpFromName: "",
  adminEmail: "",
  notifyAdmin: "false",
  uploadLocation: "local",
  upyunDomain: siteConfig.cdnUrl,
  upyunService: "",
  upyunOperator: "",
  upyunPassword: "",
  upyunImageProcess: "false",
  upyunThumbnailVersion: "",
  upyunOutputMode: "",
  upyunTokenKey: "",
  upyunTokenExpire: "1800",
  cosImageSuffix: "webp",
};

async function main() {
  console.log("🌱 [生产环境] 开始生成种子数据...");

  // 检查是否已有管理员用户
  const existingAdmin = await prisma.users.findFirst({
    where: { role: 1 },
  });

  if (!existingAdmin) {
    throw new Error("未找到管理员用户。生产环境 seed 不再创建默认弱口令管理员，请先通过后台初始化或专用测试脚本创建用户。");
  }

  console.log("⚠️  已存在管理员用户，跳过创建");
  console.log(`   👤 现有管理员: ${existingAdmin.name}`);
  const admin = existingAdmin;

  // 创建/更新元数据
  console.log("⚙️  配置网站元数据...");
  for (const [key, value] of Object.entries(SITE_META)) {
    if (value) {
      await prisma.informations.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  }
  console.log(`   ✅ 配置了 ${Object.keys(SITE_META).length} 条元数据`);

  // 创建默认分类
  console.log("📁 创建默认分类...");
  const category = await prisma.category.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "未分类",
      slug: "default",
      desc: "默认分类",
    },
  });
  console.log(`   ✅ 创建分类: ${category.name}`);

  // 创建示例文章
  console.log("📝 创建示例文章...");
  const post = await prisma.posts.upsert({
    where: { slug_type: { slug: "welcome", type: 0 } },
    update: {},
    create: {
      title: "本站新架构上线",
      slug: "welcome",
      desc: "本站基于 Nuxt 4 构建，欢迎访问",
      content: `# 本站新架构上线

本站已全新升级为 **Nuxt 4** 架构，带来更快的加载速度和更好的用户体验。

## 关于新架构

- **框架**: Nuxt 4 + Vue 3
- **数据库**: MySQL
- **ORM**: Prisma
- **部署**: PM2

## 当前状态

您现在看到的是测试数据，正式上线后：
- 友情链接将同步更新
- 文章内容将逐步迁移
- 功能持续优化中

## 反馈与建议

如果您在使用过程中发现任何问题或有改进建议，欢迎通过留言功能反馈。

感谢您的关注和支持！ 🙏`,
      status: 1,
      comment_num: 1,
      show_toc: true,
      uid: admin.uid,
      update_time: new Date(),
    },
  });
  console.log(`   ✅ 创建文章: ${post.title}`);

  // 关联文章与分类
  await prisma.postrelations.upsert({
    where: { cid_mid: { cid: post.cid, mid: category.mid } },
    update: {},
    create: {
      cid: post.cid,
      mid: category.mid,
    },
  });

  // 创建测试评论
  console.log("💬 创建测试评论...");
  const comment = await prisma.comments.upsert({
    where: { coid: -1 },
    update: {},
    create: {
      coid: -1,
      cid: post.cid,
      name: "测试用户",
      mail: "test@example.com",
      content: "这是一条测试评论，您可以登录后台删除它。",
      status: 1,
      agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ip: "127.0.0.1",
    },
  });
  console.log(`   ✅ 创建评论: ${comment.content.slice(0, 20)}...`);

  // 创建标签
  console.log("🏷️  创建标签...");
  const tag = await prisma.informations.create({
    data: {
      key: "tags",
      value: JSON.stringify([
        { name: "Nuxt", slug: "nuxt", count: 1 },
        { name: "Vue", slug: "vue", count: 1 },
        { name: "前端", slug: "frontend", count: 1 },
      ]),
    },
  });
  console.log(`   ✅ 创建标签: ${tag.key}`);

  // 创建留言页面
  console.log("📄 创建留言页面...");
  const messagePage = await prisma.posts.upsert({
    where: { slug_type: { slug: "message", type: 1 } },
    update: {},
    create: {
      title: "留言",
      slug: "message",
      desc: "欢迎在这里留言",
      content: `# 留言板

欢迎在这里留下您的想法和建议！

## 留言规则

- 请文明发言，尊重他人
- 禁止发布违法和不良信息
- 留言审核通过后会显示

期待您的留言！`,
      status: 1,
      type: 1, // 页面类型
      comment_num: 0,
      show_toc: false,
      uid: admin.uid,
      update_time: new Date(),
    },
  });
  console.log(`   ✅ 创建留言页面: ${messagePage.title}`);

  console.log("");
  console.log("✨ [生产环境] 种子数据生成完成！");
  console.log("");
  console.log("📊 数据统计：");
  console.log(`   - 管理员: 1 (${admin.name})`);
  console.log(`   - 分类: 1`);
  console.log(`   - 文章: 1`);
  console.log(`   - 评论: 1`);
  console.log(`   - 标签: 3 (Nuxt, Vue, 前端)`);
  console.log(`   - 留言页面: 1`);
  console.log("");
}

main()
  .catch(e => {
    console.error("❌ 种子数据生成失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
