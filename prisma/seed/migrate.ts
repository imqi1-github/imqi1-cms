import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import * as bcrypt from "bcrypt";
import mysql from "mysql2/promise";

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

// 创建 MySQL 连接（用于读取旧数据库）
const oldConnection = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  multipleStatements: true,
});

// 辅助函数：将 Unix 时间戳转换为 Date
function unixToDate(timestamp: number): Date {
  return timestamp > 0 ? new Date(timestamp * 1000) : new Date();
}

// 辅助函数：转换状态
function convertStatus(status: string): number {
  return status === "publish" ? 1 : 0;
}

async function migrate() {
  console.log("🔄 开始迁移旧数据库...");

  try {
    // 1. 导入 SQL 文件到临时表
    console.log("📥 导入旧数据库...");
    const sqlContent = await import("fs").then(fs => fs.readFileSync("old_theme.sql", "utf8"));

    // 删除旧的临时表（如果存在）
    await oldConnection.query(`
      DROP TABLE IF EXISTS imqi1_PicUpBackup;
      DROP TABLE IF EXISTS imqi1_comments;
      DROP TABLE IF EXISTS imqi1_contents;
      DROP TABLE IF EXISTS imqi1_feeds;
      DROP TABLE IF EXISTS imqi1_fields;
      DROP TABLE IF EXISTS imqi1_links;
      DROP TABLE IF EXISTS imqi1_metas;
      DROP TABLE IF EXISTS imqi1_options;
      DROP TABLE IF EXISTS imqi1_passkey_credentials;
      DROP TABLE IF EXISTS imqi1_passkey_login_logs;
      DROP TABLE IF EXISTS imqi1_passport_fails;
      DROP TABLE IF EXISTS imqi1_password_reset_tokens;
      DROP TABLE IF EXISTS imqi1_relationships;
      DROP TABLE IF EXISTS imqi1_updates;
      DROP TABLE IF EXISTS imqi1_users;
    `);

    // 执行 SQL 导入
    await oldConnection.query(sqlContent);
    console.log("   ✅ 旧数据库导入完成");

    // 2. 迁移用户
    console.log("👤 迁移用户...");
    const [oldUsers] = await oldConnection.query("SELECT * FROM imqi1_users");

    for (const user of oldUsers) {
      // 保持原密码或使用默认密码
      const password = user.password || "123456";
      const hashedPassword = await bcrypt.hash(password, 10);

      await prisma.user.upsert({
        where: { name: user.name },
        update: {
          nickname: user.screenName || user.name,
          mail: user.mail,
          password: hashedPassword,
          url: user.url,
          role: user.group === "administrator" ? 1 : 0,
        },
        create: {
          name: user.name,
          nickname: user.screenName || user.name,
          mail: user.mail,
          password: hashedPassword,
          url: user.url,
          role: user.group === "administrator" ? 1 : 0,
        },
      });
    }
    console.log(`   ✅ 迁移了 ${oldUsers.length} 个用户`);

    // 3. 迁移分类和标签
    console.log("📁 迁移分类和标签...");
    const [oldMetas] = await oldConnection.query("SELECT * FROM imqi1_metas");

    for (const meta of oldMetas) {
      const type = meta.type === "category" ? "category" : "tag";

      await prisma.category.upsert({
        where: { mid: meta.mid },
        update: {
          name: meta.name,
          slug: meta.slug,
          type,
          desc: meta.description || "",
          order: meta.order || 0,
          count: meta.count || 0,
          parent: meta.parent || 0,
        },
        create: {
          mid: meta.mid,
          name: meta.name,
          slug: meta.slug,
          type,
          desc: meta.description || "",
          order: meta.order || 0,
          count: meta.count || 0,
          parent: meta.parent || 0,
        },
      });
    }
    console.log(`   ✅ 迁移了 ${oldMetas.length} 个分类/标签`);

    // 4. 迁移文章
    console.log("📝 迁移文章...");
    const [oldContents] = await oldConnection.query(
      "SELECT * FROM imqi1_contents WHERE type = 'post'"
    );

    for (const content of oldContents) {
      await prisma.post.upsert({
        where: { cid: content.cid },
        update: {
          title: content.title,
          slug: content.slug,
          content: content.text || "",
          desc: "", // 旧系统没有描述，可以截取内容前200字
          created: unixToDate(content.created),
          updated: unixToDate(content.modified),
          status: convertStatus(content.status),
          comment_num: content.commentsNum || 0,
          type: 0,
          uid: content.authorId,
          allowComment: content.allowComment === "1",
          views: 0, // 旧系统没有浏览量
        },
        create: {
          cid: content.cid,
          title: content.title,
          slug: content.slug,
          content: content.text || "",
          desc: "",
          created: unixToDate(content.created),
          updated: unixToDate(content.modified),
          status: convertStatus(content.status),
          comment_num: content.commentsNum || 0,
          type: 0,
          uid: content.authorId,
          allowComment: content.allowComment === "1",
          views: 0,
        },
      });
    }
    console.log(`   ✅ 迁移了 ${oldContents.length} 篇文章`);

    // 5. 迁移文章与分类/标签的关系
    console.log("🔗 迁移文章关系...");
    const [oldRelationships] = await oldConnection.query(
      "SELECT * FROM imqi1_relationships"
    );

    // 先清除旧的关系
    await prisma.postrelation.deleteMany({});

    for (const rel of oldRelationships) {
      await prisma.postrelation.create({
        data: {
          cid: rel.cid,
          mid: rel.mid,
        },
      });
    }
    console.log(`   ✅ 迁移了 ${oldRelationships.length} 条关系`);

    // 6. 迁移评论
    console.log("💬 迁移评论...");
    const [oldComments] = await oldConnection.query(
      "SELECT * FROM imqi1_comments WHERE type = 'comment'"
    );

    for (const comment of oldComments) {
      await prisma.comment.upsert({
        where: { coid: comment.coid },
        update: {
          cid: comment.cid,
          created: unixToDate(comment.created),
          name: comment.author || "匿名",
          mail: comment.mail,
          link: comment.url,
          ip: comment.ip,
          agent: comment.agent,
          content: comment.text,
          status: comment.status === "approved" ? 1 : 0,
          parent_id: comment.parent || 0,
          uid: comment.ownerId,
        },
        create: {
          coid: comment.coid,
          cid: comment.cid,
          created: unixToDate(comment.created),
          name: comment.author || "匿名",
          mail: comment.mail,
          link: comment.url,
          ip: comment.ip,
          agent: comment.agent,
          content: comment.text,
          status: comment.status === "approved" ? 1 : 0,
          parent_id: comment.parent || 0,
          uid: comment.ownerId,
        },
      });
    }
    console.log(`   ✅ 迁移了 ${oldComments.length} 条评论`);

    // 7. 迁移友情链接
    console.log("🔗 迁移友情链接...");
    const [oldLinks] = await oldConnection.query("SELECT * FROM imqi1_links");

    for (const link of oldLinks) {
      await prisma.link.upsert({
        where: { lid: link.lid },
        update: {
          name: link.name,
          url: link.url,
          desc: link.description || "",
          image: link.image || "",
          avatar: link.user || "",
          enabled: true,
        },
        create: {
          lid: link.lid,
          name: link.name,
          url: link.url,
          desc: link.description || "",
          image: link.image || "",
          avatar: link.user || "",
          enabled: true,
        },
      });
    }
    console.log(`   ✅ 迁移了 ${oldLinks.length} 个友情链接`);

    // 8. 迁移站点配置（部分）
    console.log("⚙️  迁移站点配置...");
    const [oldOptions] = await oldConnection.query("SELECT * FROM imqi1_options");

    const optionMapping = {
      siteTitle: "siteName",
      siteUrl: "siteUrl",
      description: "siteDesc",
      keywords: "siteKeywords",
      icp: "siteIcp",
    };

    for (const option of oldOptions) {
      const newKey = optionMapping[option.name] || option.name;

      await prisma.informations.upsert({
        where: { key: newKey },
        update: { value: option.value },
        create: {
          key: newKey,
          value: option.value,
        },
      });
    }
    console.log(`   ✅ 迁移了 ${oldOptions.length} 条配置`);

    console.log("");
    console.log("✨ 数据迁移完成！");
    console.log("");
    console.log("📊 迁移统计：");
    console.log(`   - 用户: ${oldUsers.length}`);
    console.log(`   - 分类/标签: ${oldMetas.length}`);
    console.log(`   - 文章: ${oldContents.length}`);
    console.log(`   - 文章关系: ${oldRelationships.length}`);
    console.log(`   - 评论: ${oldComments.length}`);
    console.log(`   - 友情链接: ${oldLinks.length}`);
    console.log(`   - 配置: ${oldOptions.length}`);
    console.log("");
  } catch (error) {
    console.error("❌ 迁移失败:", error);
    throw error;
  } finally {
    await oldConnection.end();
    await prisma.$disconnect();
  }
}

migrate()
  .catch(e => {
    console.error("❌ 迁移脚本执行失败:", e);
    process.exit(1);
  });
