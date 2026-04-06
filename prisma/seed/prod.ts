import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

// ============================================
// 生产环境种子数据配置
// ============================================

/**
 * 管理员账户配置
 */
const ADMIN_USER = {
  name: process.env.SEED_ADMIN_NAME || "admin",
  mail: process.env.SEED_ADMIN_MAIL || "admin@example.com",
  password: process.env.SEED_ADMIN_PASSWORD || "admin123456", // 生产环境请使用强密码
};

/**
 * 网站元数据配置
 */
const SITE_META = {
  siteName: process.env.SEED_SITE_NAME || "ImQi1",
  siteUrl: process.env.SEED_SITE_URL || "https://imqi1.com",
  siteDesc: process.env.SEED_SITE_DESC || "做技术的分享者、生活的摄影师、时事的评论员。",
  siteKeywords: process.env.SEED_SITE_KEYWORDS || "棋,ImQi1,棋的小站,生活,科技,编程,学习",
  siteIcp: process.env.SEED_SITE_ICP || "",
  commentEnabled: process.env.SEED_COMMENT_ENABLED || "true",
  commentModeration: process.env.SEED_COMMENT_MODERATION || "false",
  commentAvatarService: process.env.SEED_COMMENT_AVATAR_SERVICE || "gravatar",
  commentPageSize: process.env.SEED_COMMENT_PAGE_SIZE || "10",
  commentMaxLevel: process.env.SEED_COMMENT_MAX_LEVEL || "4",
  commentRequireMail: process.env.SEED_COMMENT_REQUIRE_MAIL || "true",
  commentRequireLink: process.env.SEED_COMMENT_REQUIRE_LINK || "false",
  commentInterval: process.env.SEED_COMMENT_INTERVAL || "60",
  postPageSize: process.env.SEED_POST_PAGE_SIZE || "12",
  homeCustomText: process.env.SEED_HOME_CUSTOM_TEXT || '<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>',
  staticFilePath: process.env.SEED_STATIC_FILE_PATH || "https://cdn.imqi1.com/static",
  musicPlaylistId: process.env.SEED_MUSIC_PLAYLIST_ID || "9255074836 || netease",
  photoCategorySlug: process.env.SEED_PHOTO_CATEGORY_SLUG || "shot",
  photoCoverSuffix: process.env.SEED_PHOTO_COVER_SUFFIX || "",
  postCoverSuffix: process.env.SEED_POST_COVER_SUFFIX || "",
  moderationApiType: process.env.SEED_MODERATION_API_TYPE || "1",
  baiduAppId: process.env.SEED_BAIDU_APP_ID || "",
  baiduApiKey: process.env.SEED_BAIDU_API_KEY || "",
  baiduSecretKey: process.env.SEED_BAIDU_SECRET_KEY || "",
  baiduCheckAdmin: process.env.SEED_BAIDU_CHECK_ADMIN || "false",
  emailLogEnabled: process.env.SEED_EMAIL_LOG_ENABLED || "true",
  emailPushType: process.env.SEED_EMAIL_PUSH_TYPE || "none",
  smtpHost: process.env.SEED_SMTP_HOST || "",
  smtpUser: process.env.SEED_SMTP_USER || "",
  smtpAddress: process.env.SEED_SMTP_ADDRESS || "",
  smtpPassword: process.env.SEED_SMTP_PASSWORD || "",
  smtpSecureMode: process.env.SEED_SMTP_SECURE_MODE || "tls",
  smtpPort: process.env.SEED_SMTP_PORT || "465",
  smtpFromName: process.env.SEED_SMTP_FROM_NAME || "",
  adminEmail: process.env.SEED_ADMIN_EMAIL || "",
  notifyAdmin: process.env.SEED_NOTIFY_ADMIN || "false",
  uploadLocation: process.env.SEED_UPLOAD_LOCATION || "local",
  upyunDomain: process.env.SEED_UPYUN_DOMAIN || "https://cdn.imqi1.com",
  upyunService: process.env.SEED_UPYUN_SERVICE || "",
  upyunOperator: process.env.SEED_UPYUN_OPERATOR || "",
  upyunPassword: process.env.SEED_UPYUN_PASSWORD || "",
  upyunImageProcess: process.env.SEED_UPYUN_IMAGE_PROCESS || "false",
  upyunThumbnailVersion: process.env.SEED_UPYUN_THUMBNAIL_VERSION || "",
  upyunOutputMode: process.env.SEED_UPYUN_OUTPUT_MODE || "",
  upyunTokenKey: process.env.SEED_UPYUN_TOKEN_KEY || "",
  upyunTokenExpire: process.env.SEED_UPYUN_TOKEN_EXPIRE || "1800",
};

async function main() {
  console.log("🌱 [生产环境] 开始生成种子数据...");

  // 检查是否已有管理员用户
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 1 },
  });

  let admin;
  if (existingAdmin) {
    console.log("⚠️  已存在管理员用户，跳过创建");
    console.log(`   👤 现有管理员: ${existingAdmin.name}`);
    admin = existingAdmin;
  } else {
    // 创建管理员用户
    console.log("👤 创建管理员用户...");
    const hashedPassword = await bcrypt.hash(ADMIN_USER.password, 10);
    admin = await prisma.user.create({
      data: {
        name: ADMIN_USER.name,
        nickname: "管理员",
        mail: ADMIN_USER.mail,
        password: hashedPassword,
        role: 1,
      },
    });
    console.log(`   ✅ 创建管理员: ${admin.name}`);
    console.log(`   📧 邮箱: ${admin.mail}`);
    console.log(`   🔑 密码: ${ADMIN_USER.password}`);
    console.log("   ⚠️  请尽快修改默认密码！");
  }

  // 创建/更新元数据
  console.log("⚙️  配置网站元数据...");
  for (const [key, value] of Object.entries(SITE_META)) {
    if (value) {
      await prisma.meta.upsert({
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
      class: "default",
    },
  });
  console.log(`   ✅ 创建分类: ${category.name}`);

  // 创建示例文章
  console.log("📝 创建示例文章...");
  const post = await prisma.post.create({
    data: {
      title: "欢迎使用新的博客系统",
      slug: "1",
      desc: "这是您的第一篇文章，可以登录后台进行编辑或删除。",
      content: `# 欢迎使用新的博客系统

这是您的第一篇文章，可以登录后台进行编辑或删除。

## 开始使用

1. 登录后台管理系统
2. 编辑或删除这篇文章
3. 发布您的第一篇原创内容

祝您使用愉快！`,
      status: 1,
      comment_num: 1,
      show_toc: true,
      uid: admin.uid,
    },
  });
  console.log(`   ✅ 创建文章: ${post.title}`);

  // 关联文章与分类
  await prisma.postRelation.create({
    data: {
      cid: post.cid,
      mid: category.mid,
    },
  });

  // 创建测试评论
  console.log("💬 创建测试评论...");
  const comment = await prisma.comment.create({
    data: {
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

  console.log("");
  console.log("✨ [生产环境] 种子数据生成完成！");
  console.log("");
  console.log("📊 数据统计：");
  console.log(`   - 管理员: 1 (${admin.name})`);
  console.log(`   - 分类: 1`);
  console.log(`   - 文章: 1`);
  console.log(`   - 评论: 1`);
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
