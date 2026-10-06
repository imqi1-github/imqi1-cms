-- ============================================================
-- ImQi1 CMS 数据库初始化脚本（PostgreSQL）
-- 直接、完整建库：不幂等、不兼容旧库 —— 仅在空库上运行一次。
-- ============================================================
-- 列类型与 prisma/schema.prisma 一致：SERIAL / VARCHAR(n) / TEXT / TIMESTAMP(3) / BOOLEAN / JSONB / DOUBLE PRECISION / INTEGER。
-- 标识符双引保留列名大小写与 Prisma 生成库一致。
-- ============================================================

-- ============================================================
-- 一、数据表（父表在前，FK 内联）
-- ============================================================

CREATE TABLE "users" (
  "uid" SERIAL NOT NULL,
  "name" VARCHAR(191) NOT NULL,
  "nickname" VARCHAR(191),
  "avatar" VARCHAR(191),
  "mail" VARCHAR(191) NOT NULL,
  "password" VARCHAR(191) NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "auth_code" VARCHAR(191),
  "totp_secret" TEXT,
  "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("uid")
);

CREATE TABLE "trusted_devices" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "deviceId" TEXT NOT NULL,
  "name" TEXT,
  "ip" TEXT,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "TrustedDevices_deviceId_key" UNIQUE ("deviceId"),
  CONSTRAINT "TrustedDevices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("uid") ON DELETE CASCADE
);

CREATE TABLE "attachments" (
  "aid" SERIAL NOT NULL,
  "type" VARCHAR(191) NOT NULL,
  "title" VARCHAR(191) NOT NULL,
  "url" VARCHAR(191) NOT NULL,
  "storage" VARCHAR(191) NOT NULL DEFAULT 'local',
  "metadata" JSONB,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("aid")
);

CREATE TABLE "metas" (
  "mid" SERIAL NOT NULL,
  "name" VARCHAR(191) NOT NULL,
  "slug" VARCHAR(191),
  "desc" VARCHAR(191),
  "type" VARCHAR(191) NOT NULL DEFAULT 'category',
  PRIMARY KEY ("mid")
);

CREATE TABLE "changelogs" (
  "id" SERIAL NOT NULL,
  "content" TEXT NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE "links" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(191) NOT NULL,
  "desc" VARCHAR(191),
  "link" VARCHAR(191) NOT NULL,
  "avatar" VARCHAR(191),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "originalLinkId" INTEGER,
  "isModification" BOOLEAN NOT NULL DEFAULT false,
  "modificationStatus" VARCHAR(191) DEFAULT 'pending',
  PRIMARY KEY ("id"),
  CONSTRAINT "links_originalLinkId_fkey" FOREIGN KEY ("originalLinkId") REFERENCES "links"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "informations" (
  "id" SERIAL NOT NULL,
  "key" VARCHAR(191) NOT NULL,
  "value" VARCHAR(191) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE "travels" (
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

CREATE TABLE "subscribes" (
  "id" SERIAL NOT NULL,
  "url" VARCHAR(191) NOT NULL,
  "name" VARCHAR(191) NOT NULL,
  "avatar" VARCHAR(191),
  "lastUpdated" TIMESTAMP(3),
  PRIMARY KEY ("id")
);

CREATE TABLE "contents" (
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
  "scheduled_at" TIMESTAMP(3),
  PRIMARY KEY ("cid"),
  CONSTRAINT "Contents_uid_fkey" FOREIGN KEY ("uid") REFERENCES "users"("uid") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "comments" (
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

CREATE TABLE "contentrelations" (
  "cid" INTEGER NOT NULL,
  "mid" INTEGER NOT NULL,
  PRIMARY KEY ("mid", "cid"),
  CONSTRAINT "ContentRelation_cid_fkey" FOREIGN KEY ("cid") REFERENCES "contents"("cid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContentRelation_mid_fkey" FOREIGN KEY ("mid") REFERENCES "metas"("mid") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "contentattachments" (
  "aid" INTEGER NOT NULL,
  "cid" INTEGER NOT NULL,
  PRIMARY KEY ("aid", "cid"),
  CONSTRAINT "ContentAttachments_aid_fkey" FOREIGN KEY ("aid") REFERENCES "attachments"("aid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContentAttachments_cid_fkey" FOREIGN KEY ("cid") REFERENCES "contents"("cid") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "subscribeposts" (
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

CREATE TABLE "sessions" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "authCode" VARCHAR(191) NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "data" VARCHAR(191),
  PRIMARY KEY ("id")
);

CREATE TABLE "contenttravels" (
  "travel_id" INTEGER NOT NULL,
  "cid" INTEGER NOT NULL,
  PRIMARY KEY ("travel_id", "cid"),
  CONSTRAINT "ContentTravels_travel_id_fkey" FOREIGN KEY ("travel_id") REFERENCES "travels"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContentTravels_cid_fkey" FOREIGN KEY ("cid") REFERENCES "contents"("cid") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "likes" (
  "id" SERIAL NOT NULL,
  "cid" INTEGER NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "ip" VARCHAR(45),
  "user_agent" VARCHAR(255),
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "Likes_cid_fkey" FOREIGN KEY ("cid") REFERENCES "contents"("cid") ON DELETE CASCADE ON UPDATE CASCADE
);


-- ============================================================
-- 二、索引（PG 索引不能内联在 CREATE TABLE 中，单独 CREATE；名与 Prisma 生成一致）
-- ============================================================

CREATE UNIQUE INDEX "Users_name_key" ON "users"("name");
CREATE UNIQUE INDEX "Users_mail_key" ON "users"("mail");
CREATE UNIQUE INDEX "Metas_name_key" ON "metas"("name");
CREATE UNIQUE INDEX "Metas_slug_key" ON "metas"("slug");
CREATE INDEX "Metas_mid_type_idx" ON "metas"("mid", "type");
CREATE INDEX "Changelogs_create_time_idx" ON "changelogs"("create_time");
CREATE UNIQUE INDEX "Informations_key_key" ON "informations"("key");
CREATE INDEX "links_originalLinkId_idx" ON "links"("originalLinkId");
CREATE INDEX "Travels_sort_idx" ON "travels"("sort");
CREATE INDEX "Contents_status_type_create_time_idx" ON "contents"("status", "type", "create_time");
CREATE INDEX "Contents_status_scheduled_at_idx" ON "contents"("status", "scheduled_at");
CREATE UNIQUE INDEX "Contents_slug_type_key" ON "contents"("slug", "type");
CREATE INDEX "Contents_uid_idx" ON "contents"("uid");
CREATE INDEX "Comments_cid_idx" ON "comments"("cid");
CREATE INDEX "ContentRelation_mid_cid_idx" ON "contentrelations"("mid", "cid");
CREATE INDEX "ContentRelation_cid_idx" ON "contentrelations"("cid");
CREATE INDEX "ContentAttachments_aid_idx" ON "contentattachments"("aid");
CREATE INDEX "ContentAttachments_cid_idx" ON "contentattachments"("cid");
CREATE UNIQUE INDEX "SubscribePost_link_key" ON "subscribeposts"("link");
CREATE INDEX "SubscribePost_subscribeId_idx" ON "subscribeposts"("subscribeId");
CREATE INDEX "Sessions_expires_idx" ON "sessions"("expires");
CREATE INDEX "Sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX "ContentTravels_travel_id_idx" ON "contenttravels"("travel_id");
CREATE INDEX "ContentTravels_cid_idx" ON "contenttravels"("cid");
CREATE UNIQUE INDEX "Likes_cid_fingerprint_key" ON "likes"("cid", "fingerprint");
CREATE INDEX "Likes_cid_create_time_idx" ON "likes"("cid", "create_time");

-- ============================================================
-- 三、站点设置项默认值（informations 表）
-- value 列为字符串，布尔值以 'true' / 'false' 存储，数字以字符串存储。
-- ============================================================

INSERT INTO "informations" ("key", "value") VALUES
  ('siteName', ''),
  ('siteUrl', ''),
  ('siteDesc', ''),
  ('siteIcp', ''),
  ('homeCustomText', ''),
  ('photoCategorySlug', ''),
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
  ('musicPlaylistId', ''),
  ('moderationApiType', '1'),
  ('baiduApiKey', ''),
  ('baiduSecretKey', ''),
  ('baiduCheckAdmin', 'false'),
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
  ('cosImageSuffix', ''),
  ('sessionStoreType', 'memory'),
  ('messageContentId', ''),
  ('linkAutoApprove', 'false'),
  ('searchCacheEnabled', 'false'),
  ('searchCacheExpire', '300');

-- ============================================================
-- 四、示例数据（仅在空库上有效；已有数据的库会因主键冲突直接报错）
-- 密码 123456 的 bcrypt 哈希；登录后请尽快修改。
-- ============================================================

INSERT INTO "users" ("uid", "name", "nickname", "mail", "password", "create_time") VALUES
  (1, 'admin', '默认管理员', 'example@example.com', '$2b$10$hpAJTTHU9sKV0reiQL8FWun.6gR6RDlotAfbCZyGJZbUyozeS6ON6', now());

INSERT INTO "metas" ("mid", "name", "slug", "desc", "type") VALUES
  (1, '默认分类', 'default', '默认文章分类', 'category');

INSERT INTO "contents" ("cid", "title", "slug", "desc", "content", "create_time", "update_time", "status", "comment_num", "type", "uid") VALUES
  (1, '你好，世界', 'hello-world', '这是一篇示例文章，用于演示站点的文章展示效果。',
   E'# 你好，世界\n\n欢迎使用 **ImQi1 CMS**！这是一篇自动生成的示例文章。\n\n你可以在后台「文章管理」中编辑或删除它，然后开始创作属于你自己的内容。\n\n## Markdown 支持\n\n- 标题、段落、列表\n- **加粗**、*斜体*、`行内代码`\n- 代码块（基于 Shiki 高亮）\n- 图片、链接、引用等\n\n```js\nconsole.log("Hello, ImQi1 CMS!");\n```\n',
   now(), now(), 1, 1, 0, 1);

INSERT INTO "contentrelations" ("cid", "mid") VALUES (1, 1);

INSERT INTO "comments" ("coid", "cid", "name", "mail", "content", "create_time", "status") VALUES
  (1, 1, '访客', 'guest@example.com', '这是一条示例评论，欢迎在留言板或文章下方参与讨论！', now(), 1);

-- ============================================================
-- 五、pg_trgm 扩展与 trgm 索引（让 LIKE '%q%' 走 GIN 索引）
-- 需要 superuser 权限创建扩展；应用账号若无，可单独用 psql 以 superuser 执行本段。
-- ============================================================

CREATE EXTENSION pg_trgm;

CREATE INDEX "contents_title_trgm" ON "contents" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "contents_desc_trgm" ON "contents" USING GIN ("desc" gin_trgm_ops);
CREATE INDEX "contents_content_trgm" ON "contents" USING GIN ("content" gin_trgm_ops);
CREATE INDEX "comments_content_trgm" ON "comments" USING GIN ("content" gin_trgm_ops);
CREATE INDEX "comments_name_trgm" ON "comments" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "subscribes_name_trgm" ON "subscribes" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "subscribes_url_trgm" ON "subscribes" USING GIN ("url" gin_trgm_ops);
CREATE INDEX "links_name_trgm" ON "links" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "links_link_trgm" ON "links" USING GIN ("link" gin_trgm_ops);
CREATE INDEX "links_desc_trgm" ON "links" USING GIN ("desc" gin_trgm_ops);
CREATE INDEX "subscribeposts_title_trgm" ON "subscribeposts" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "subscribeposts_description_trgm" ON "subscribeposts" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "subscribeposts_content_trgm" ON "subscribeposts" USING GIN ("content" gin_trgm_ops);
CREATE INDEX "subscribeposts_author_trgm" ON "subscribeposts" USING GIN ("author" gin_trgm_ops);