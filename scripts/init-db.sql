-- ============================================================
-- ImQi1 CMS 数据库初始化脚本（PostgreSQL，开发 / 生产通用）
-- 列类型以 prisma migrate diff 生成的 PG DDL 为准：
--   普通 String → TEXT；@db.VarChar(n) → VARCHAR(n)；自增 → SERIAL；
--   DateTime → TIMESTAMP(3)（无时区）；Boolean → BOOLEAN；Json → JSONB；Float → DOUBLE PRECISION。
-- ============================================================
-- 幂等性：
--   建表 CREATE TABLE IF NOT EXISTS；外键内联（父表优先，目标表先建），
--   索引 IF NOT EXISTS；种子 INSERT ... ON CONFLICT DO NOTHING（不覆盖后台改过的值）。
--   标识符一律双引号保留 camelCase 列名（与 Prisma 生成库一致）。
-- ============================================================

-- ============================================================
-- 一、数据表结构（父表在前，FK 内联）
-- ============================================================

CREATE TABLE IF NOT EXISTS "users" (
  "uid" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "nickname" TEXT,
  "avatar" TEXT,
  "mail" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "auth_code" TEXT,
  "totp_secret" TEXT,
  "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("uid")
);

-- 已信任设备（2FA 「信任此设备」的管理/撤回）：
CREATE TABLE IF NOT EXISTS "trusted_devices" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "deviceId" TEXT NOT NULL,
  "userAgent" TEXT,
  "ip" TEXT,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "TrustedDevices_deviceId_key" UNIQUE ("deviceId"),
  CONSTRAINT "TrustedDevices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("uid") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "TrustedDevices_userId_idx" ON "trusted_devices"("userId");

CREATE TABLE IF NOT EXISTS "attachments" (
  "aid" SERIAL NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "storage" TEXT NOT NULL DEFAULT 'local',
  "metadata" JSONB,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("aid")
);

CREATE TABLE IF NOT EXISTS "metas" (
  "mid" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT,
  "desc" TEXT,
  "type" TEXT NOT NULL DEFAULT 'category',
  PRIMARY KEY ("mid")
);

CREATE TABLE IF NOT EXISTS "changelogs" (
  "id" SERIAL NOT NULL,
  "content" TEXT NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "links" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "desc" TEXT,
  "link" TEXT NOT NULL,
  "avatar" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "originalLinkId" INTEGER,
  "isModification" BOOLEAN NOT NULL DEFAULT false,
  "modificationStatus" TEXT DEFAULT 'pending',
  PRIMARY KEY ("id"),
  CONSTRAINT "links_originalLinkId_fkey" FOREIGN KEY ("originalLinkId") REFERENCES "links"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "informations" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "travels" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "desc" TEXT,
  "cover" VARCHAR(500),
  "longitude" DOUBLE PRECISION NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subscribes" (
  "id" SERIAL NOT NULL,
  "url" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "avatar" TEXT,
  "lastUpdated" TIMESTAMP(3),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "contents" (
  "cid" SERIAL NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "slug" VARCHAR(255),
  "desc" TEXT,
  "content" TEXT,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_time" TIMESTAMP(3) NOT NULL,
  "status" INTEGER NOT NULL DEFAULT 1,
  "comment_num" INTEGER NOT NULL DEFAULT 0,
  "many_covers" BOOLEAN NOT NULL DEFAULT false,
  "covers" TEXT,
  "show_toc" BOOLEAN NOT NULL DEFAULT false,
  "tags" VARCHAR(500),
  "type" INTEGER NOT NULL DEFAULT 0,
  "uid" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("cid"),
  CONSTRAINT "Contents_uid_fkey" FOREIGN KEY ("uid") REFERENCES "users"("uid") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "comments" (
  "coid" SERIAL NOT NULL,
  "cid" INTEGER NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "mail" VARCHAR(255),
  "link" VARCHAR(500),
  "content" TEXT NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" INTEGER NOT NULL DEFAULT 0,
  "parent_id" INTEGER,
  "agent" VARCHAR(500),
  "ip" VARCHAR(45),
  PRIMARY KEY ("coid"),
  CONSTRAINT "Comments_cid_fkey" FOREIGN KEY ("cid") REFERENCES "contents"("cid") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "contentrelations" (
  "cid" INTEGER NOT NULL,
  "mid" INTEGER NOT NULL,
  PRIMARY KEY ("mid", "cid"),
  CONSTRAINT "ContentRelation_cid_fkey" FOREIGN KEY ("cid") REFERENCES "contents"("cid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContentRelation_mid_fkey" FOREIGN KEY ("mid") REFERENCES "metas"("mid") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "contentattachments" (
  "aid" INTEGER NOT NULL,
  "cid" INTEGER NOT NULL,
  PRIMARY KEY ("aid", "cid"),
  CONSTRAINT "ContentAttachments_aid_fkey" FOREIGN KEY ("aid") REFERENCES "attachments"("aid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContentAttachments_cid_fkey" FOREIGN KEY ("cid") REFERENCES "contents"("cid") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "subscribeposts" (
  "id" SERIAL NOT NULL,
  "subscribeId" INTEGER NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "link" VARCHAR(500) NOT NULL,
  "description" TEXT,
  "content" TEXT,
  "author" VARCHAR(255),
  "pubDate" TIMESTAMP(3),
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "SubscribePost_subscribeId_fkey" FOREIGN KEY ("subscribeId") REFERENCES "subscribes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "authCode" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "data" TEXT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "contenttravels" (
  "travel_id" INTEGER NOT NULL,
  "cid" INTEGER NOT NULL,
  PRIMARY KEY ("travel_id", "cid"),
  CONSTRAINT "ContentTravels_travel_id_fkey" FOREIGN KEY ("travel_id") REFERENCES "travels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContentTravels_cid_fkey" FOREIGN KEY ("cid") REFERENCES "contents"("cid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 二、索引（PG 索引不能内联在 CREATE TABLE 中，单独 CREATE；名与 Prisma 生成一致）
--     FK 列索引用 `_idx` 后缀，避免与 FK 约束名（`_fkey`）在 PG schema 命名空间冲突。
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS "Users_name_key" ON "users"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Users_mail_key" ON "users"("mail");
CREATE UNIQUE INDEX IF NOT EXISTS "Metas_name_key" ON "metas"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Metas_slug_key" ON "metas"("slug");
CREATE INDEX IF NOT EXISTS "Metas_mid_type_idx" ON "metas"("mid", "type");
CREATE INDEX IF NOT EXISTS "Changelogs_create_time_idx" ON "changelogs"("create_time");
CREATE UNIQUE INDEX IF NOT EXISTS "Informations_key_key" ON "informations"("key");
CREATE INDEX IF NOT EXISTS "links_originalLinkId_idx" ON "links"("originalLinkId");
CREATE INDEX IF NOT EXISTS "Travels_sort_idx" ON "travels"("sort");
CREATE INDEX IF NOT EXISTS "Contents_status_type_create_time_idx" ON "contents"("status", "type", "create_time");
CREATE UNIQUE INDEX IF NOT EXISTS "Contents_slug_type_key" ON "contents"("slug", "type");
CREATE INDEX IF NOT EXISTS "Contents_uid_idx" ON "contents"("uid");
CREATE INDEX IF NOT EXISTS "Comments_cid_idx" ON "comments"("cid");
CREATE INDEX IF NOT EXISTS "ContentRelation_mid_cid_idx" ON "contentrelations"("mid", "cid");
CREATE INDEX IF NOT EXISTS "ContentRelation_cid_idx" ON "contentrelations"("cid");
CREATE INDEX IF NOT EXISTS "ContentAttachments_aid_idx" ON "contentattachments"("aid");
CREATE INDEX IF NOT EXISTS "ContentAttachments_cid_idx" ON "contentattachments"("cid");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscribePost_link_key" ON "subscribeposts"("link");
CREATE INDEX IF NOT EXISTS "SubscribePost_subscribeId_idx" ON "subscribeposts"("subscribeId");
CREATE INDEX IF NOT EXISTS "Sessions_expires_idx" ON "sessions"("expires");
CREATE INDEX IF NOT EXISTS "Sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX IF NOT EXISTS "ContentTravels_travel_id_idx" ON "contenttravels"("travel_id");
CREATE INDEX IF NOT EXISTS "ContentTravels_cid_idx" ON "contenttravels"("cid");

-- ============================================================
-- 三、站点设置项默认值（informations 表）
-- value 列为字符串，布尔值以 'true' / 'false' 存储，数字以字符串存储。
-- ============================================================
INSERT INTO "informations" ("key", "value") VALUES
  ('siteName', 'ImQi1'),
  ('siteUrl', 'https://imqi1.com'),
  ('siteDesc', '做技术的分享者、生活的摄影师、时事的评论员。'),
  ('siteIcp', ''),
  ('homeCustomText', '<p>做技术的分享者 · 生活的摄影师 · 时事的评论员</p>'),
  ('photoCategorySlug', 'shot'),
  ('commentEnabled', 'true'),
  ('commentModeration', 'false'),
  ('commentAvatarService', 'gravatar'),
  ('commentPageSize', '10'),
  ('commentMaxLevel', '4'),
  ('commentRequireMail', 'true'),
  ('commentRequireLink', 'false'),
  ('commentInterval', '60'),
  ('contentPageSize', '12'),
  ('feedCacheInterval', '8'),
  ('musicPlaylistId', '9255074836 || netease'),
  ('moderationApiType', '1'),
  ('baiduAppId', ''),
  ('baiduApiKey', ''),
  ('baiduSecretKey', ''),
  ('baiduCheckAdmin', 'false'),
  ('emailLogEnabled', 'true'),
  ('emailPushType', 'none'),
  ('smtpHost', ''),
  ('smtpUser', ''),
  ('smtpAddress', ''),
  ('smtpPassword', ''),
  ('smtpSecureMode', 'tls'),
  ('smtpPort', '465'),
  ('smtpFromName', ''),
  ('adminEmail', ''),
  ('notifyAdmin', 'false'),
  ('uploadLocation', 'local'),
  ('cosSecretId', ''),
  ('cosSecretKey', ''),
  ('cosBucket', ''),
  ('cosRegion', ''),
  ('cosSourceDomain', ''),
  ('cosCdnDomain', ''),
  ('cosImageSuffix', 'webp'),
  ('sessionStoreType', 'memory'),
  ('messageContentId', ''),
  ('linkAutoApprove', 'false'),
  ('searchCacheEnabled', 'false'),
  ('searchCacheExpire', '300')
ON CONFLICT ("key") DO NOTHING;

-- ============================================================
-- 四、示例数据（仅在空库时插入；已有数据的库跳过，不产生脏示例行）
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "contents") THEN
    -- 4.1 默认管理员（admin / 123456 / example@example.com / 默认管理员）
    -- 密码为 bcrypt('123456') 的哈希；登录后请尽快修改。
    INSERT INTO "users" ("uid", "name", "nickname", "mail", "password", "create_time") VALUES
      (1, 'admin', '默认管理员', 'example@example.com', '$2b$10$hpAJTTHU9sKV0reiQL8FWun.6gR6RDlotAfbCZyGJZbUyozeS6ON6', now())
    ON CONFLICT ("uid") DO NOTHING;

    -- 4.2 默认分类
    INSERT INTO "metas" ("mid", "name", "slug", "desc", "type") VALUES
      (1, '默认分类', 'default', '默认文章分类', 'category')
    ON CONFLICT ("mid") DO NOTHING;

    -- 4.3 示例文章（type=0 文章，status=1 已发布）
    INSERT INTO "contents" ("cid", "title", "slug", "desc", "content", "create_time", "update_time", "status", "comment_num", "type", "uid") VALUES
      (1, '你好，世界', 'hello-world', '这是一篇示例文章，用于演示站点的文章展示效果。',
       E'# 你好，世界\n\n欢迎使用 **ImQi1 CMS**！这是一篇自动生成的示例文章。\n\n你可以在后台「文章管理」中编辑或删除它，然后开始创作属于你自己的内容。\n\n## Markdown 支持\n\n- 标题、段落、列表\n- **加粗**、*斜体*、`行内代码`\n- 代码块（基于 Shiki 高亮）\n- 图片、链接、引用等\n\n```js\nconsole.log("Hello, ImQi1 CMS!");\n```\n',
       now(), now(), 1, 1, 0, 1)
    ON CONFLICT ("cid") DO NOTHING;

    -- 4.4 文章 ↔ 分类 关联
    INSERT INTO "contentrelations" ("cid", "mid") VALUES
      (1, 1)
    ON CONFLICT ("mid", "cid") DO NOTHING;

    -- 4.5 示例评论（status=1 已通过审核，前台可见）
    INSERT INTO "comments" ("coid", "cid", "name", "mail", "content", "create_time", "status") VALUES
      (1, 1, '访客', 'guest@example.com', '这是一条示例评论，欢迎在留言板或文章下方参与讨论！', now(), 1)
    ON CONFLICT ("coid") DO NOTHING;
  END IF;
END
$$;

-- ============================================================
-- 五、pg_trgm 子串搜索索引（让 LIKE '%q%' 走 GIN 索引，召回 100% 且有索引）
-- 需要 superuser 权限创建扩展；应用账号若无，可单独用 psql 以 superuser 执行本段。
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "contents_title_trgm" ON "contents" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "contents_desc_trgm" ON "contents" USING GIN ("desc" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "contents_content_trgm" ON "contents" USING GIN ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "comments_content_trgm" ON "comments" USING GIN ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "comments_name_trgm" ON "comments" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "subscribes_name_trgm" ON "subscribes" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "subscribes_url_trgm" ON "subscribes" USING GIN ("url" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "links_name_trgm" ON "links" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "links_link_trgm" ON "links" USING GIN ("link" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "links_desc_trgm" ON "links" USING GIN ("desc" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "subscribeposts_title_trgm" ON "subscribeposts" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "subscribeposts_description_trgm" ON "subscribeposts" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "subscribeposts_content_trgm" ON "subscribeposts" USING GIN ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "subscribeposts_author_trgm" ON "subscribeposts" USING GIN ("author" gin_trgm_ops);
