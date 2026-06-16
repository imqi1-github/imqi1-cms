import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  connectionLimit: 10,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 初始化最小测试数据...");

  const existingUser = await prisma.users.findFirst({
    where: {
      OR: [
        { name: "test-admin" },
        { mail: "test-admin@example.com" },
      ],
    },
  });

  const hashedPassword = await bcrypt.hash("admin123456", 10);
  const user = existingUser ?? (await prisma.users.create({
    data: {
      name: "test-admin",
      nickname: "测试管理员",
      mail: "test-admin@example.com",
      password: hashedPassword,
      role: 1,
    },
  }));

  const category = await prisma.metas.upsert({
    where: { slug: "test-category" },
    update: {},
    create: {
      name: "测试分类",
      slug: "test-category",
      desc: "用于本地测试的分类",
      type: "category",
    },
  });

  const post = await prisma.posts.upsert({
    where: { slug_type: { slug: "test-post", type: 0 } },
    update: {},
    create: {
      title: "测试文章",
      slug: "test-post",
      desc: "用于初始化数据库的测试文章",
      content: "# 测试文章\n\n这是一篇用于初始化数据库的测试文章。",
      status: 1,
      comment_num: 1,
      show_toc: true,
      uid: user.uid,
      update_time: new Date(),
    },
  });

  await prisma.postrelations.upsert({
    where: { cid_mid: { cid: post.cid, mid: category.mid } },
    update: {},
    create: {
      cid: post.cid,
      mid: category.mid,
    },
  });

  const existingComment = await prisma.comments.findFirst({
    where: {
      cid: post.cid,
      mail: "test-comment@example.com",
    },
  });

  const comment = existingComment ?? (await prisma.comments.create({
    data: {
      cid: post.cid,
      name: "测试评论者",
      mail: "test-comment@example.com",
      content: "这是一条用于初始化数据库的测试评论。",
      status: 1,
      agent: "init-test-db",
      ip: "127.0.0.1",
    },
  }));

  console.log("✅ 最小测试数据初始化完成");
  console.log(`   用户: ${user.name} / admin123456`);
  console.log(`   分类: ${category.name}`);
  console.log(`   文章: ${post.title}`);
  console.log(`   评论: ${comment.content.slice(0, 20)}...`);
}

main()
  .catch(error => {
    console.error("❌ 初始化最小测试数据失败:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
