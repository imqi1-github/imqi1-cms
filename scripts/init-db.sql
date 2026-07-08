-- ============================================================
-- ImQi1 CMS 数据库初始化脚本（开发 / 生产通用）
-- ============================================================
-- 作用：
--   1. 创建全部数据表（结构与 prisma/schema.prisma 保持一致）
--   2. 写入全部站点设置项的默认值
--   3. 插入一份示例数据：1 个管理员、1 个分类、1 篇文章、1 条评论
--
-- 默认管理员账户：
--   用户名: admin
--   密码:   123456
--   邮箱:   example@example.com
--   昵称:   默认管理员
--   ⚠️ 登录后请立即在后台「账户设置」中修改密码。
--
-- 使用方式：
--   - 开发环境：bun run db:init（脚本会自动读取本文件并执行）
--   - 生产环境：在数据库管理工具（phpMyAdmin / Navicat / mysql cli 等）中
--                直接导入本文件执行。
--
-- 幂等性：
--   - 所有建表使用 CREATE TABLE IF NOT EXISTS，外键内联在建表语句中，
--     重复执行不会报「表已存在」或「约束已存在」。
--   - 所有种子数据使用 ON DUPLICATE KEY UPDATE，重复执行不会产生重复行，
--     也不会覆盖你后续在后台修改过的值（包括管理员密码）。
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 一、数据表结构
-- ============================================================

CREATE TABLE IF NOT EXISTS `users` (
  `uid` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(191) NULL,
  `avatar` VARCHAR(191) NULL,
  `mail` VARCHAR(191) NOT NULL,
  `password` VARCHAR(191) NOT NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `auth_code` VARCHAR(191) NULL,
  UNIQUE INDEX `Users_name_key`(`name`),
  UNIQUE INDEX `Users_mail_key`(`mail`),
  PRIMARY KEY (`uid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attachments` (
  `aid` INTEGER NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `url` VARCHAR(191) NOT NULL,
  `storage` VARCHAR(191) NOT NULL DEFAULT 'local',
  `metadata` JSON NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`aid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `metas` (
  `mid` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NULL,
  `desc` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'category',
  UNIQUE INDEX `Metas_name_key`(`name`),
  UNIQUE INDEX `Metas_slug_key`(`slug`),
  INDEX `Metas_mid_type_idx`(`mid`, `type`),
  PRIMARY KEY (`mid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `changelogs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `content` TEXT NOT NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `Changelogs_create_time_idx`(`create_time`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `links` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `desc` VARCHAR(191) NULL,
  `link` VARCHAR(191) NOT NULL,
  `avatar` VARCHAR(191) NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `originalLinkId` INTEGER NULL,
  `isModification` BOOLEAN NOT NULL DEFAULT false,
  `modificationStatus` VARCHAR(191) NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  INDEX `links_originalLinkId_fkey`(`originalLinkId`),
  CONSTRAINT `links_originalLinkId_fkey` FOREIGN KEY (`originalLinkId`) REFERENCES `links`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `informations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(191) NOT NULL,
  `value` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `Informations_key_key`(`key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `travels` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `desc` TEXT NULL,
  `cover` VARCHAR(500) NULL,
  `longitude` DOUBLE NOT NULL,
  `latitude` DOUBLE NOT NULL,
  `sort` INTEGER NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `Travels_sort_idx`(`sort`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscribes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `url` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `avatar` VARCHAR(191) NULL,
  `lastUpdated` DATETIME(3) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contents` (
  `cid` INTEGER NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NULL,
  `desc` TEXT NULL,
  `content` LONGTEXT NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `update_time` DATETIME(3) NOT NULL,
  `status` INTEGER NOT NULL DEFAULT 1,
  `comment_num` INTEGER NOT NULL DEFAULT 0,
  `many_covers` BOOLEAN NOT NULL DEFAULT false,
  `covers` TEXT NULL,
  `show_toc` BOOLEAN NOT NULL DEFAULT false,
  `tags` VARCHAR(500) NULL,
  `type` INTEGER NOT NULL DEFAULT 0,
  `uid` INTEGER NOT NULL DEFAULT 1,
  INDEX `Contents_status_type_create_time_idx`(`status`, `type`, `create_time`),
  INDEX `Contents_uid_fkey`(`uid`),
  UNIQUE INDEX `Contents_slug_type_key`(`slug`, `type`),
  PRIMARY KEY (`cid`),
  CONSTRAINT `Contents_uid_fkey` FOREIGN KEY (`uid`) REFERENCES `users`(`uid`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comments` (
  `coid` INTEGER NOT NULL AUTO_INCREMENT,
  `cid` INTEGER NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `mail` VARCHAR(255) NULL,
  `link` VARCHAR(500) NULL,
  `content` TEXT NOT NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` INTEGER NOT NULL DEFAULT 0,
  `parent_id` INTEGER NULL,
  `agent` VARCHAR(500) NULL,
  `ip` VARCHAR(45) NULL,
  INDEX `Comments_cid_fkey`(`cid`),
  PRIMARY KEY (`coid`),
  CONSTRAINT `Comments_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `contents`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contentrelations` (
  `cid` INTEGER NOT NULL,
  `mid` INTEGER NOT NULL,
  INDEX `ContentRelation_mid_cid_idx`(`mid`, `cid`),
  INDEX `ContentRelation_cid_fkey`(`cid`),
  PRIMARY KEY (`mid`, `cid`),
  CONSTRAINT `ContentRelation_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `contents`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ContentRelation_mid_fkey` FOREIGN KEY (`mid`) REFERENCES `metas`(`mid`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contentattachments` (
  `aid` INTEGER NOT NULL,
  `cid` INTEGER NOT NULL,
  INDEX `ContentAttachments_aid_fkey`(`aid`),
  INDEX `ContentAttachments_cid_fkey`(`cid`),
  PRIMARY KEY (`aid`, `cid`),
  CONSTRAINT `ContentAttachments_aid_fkey` FOREIGN KEY (`aid`) REFERENCES `attachments`(`aid`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ContentAttachments_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `contents`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscribeposts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `subscribeId` INTEGER NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `link` VARCHAR(500) NOT NULL,
  `description` TEXT NULL,
  `content` LONGTEXT NULL,
  `author` VARCHAR(255) NULL,
  `pubDate` DATETIME(3) NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SubscribePost_link_key`(`link`),
  INDEX `SubscribePost_subscribeId_fkey`(`subscribeId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SubscribePost_subscribeId_fkey` FOREIGN KEY (`subscribeId`) REFERENCES `subscribes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` VARCHAR(191) NOT NULL,
  `userId` INTEGER NOT NULL,
  `authCode` VARCHAR(191) NOT NULL,
  `expires` DATETIME(3) NOT NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `data` VARCHAR(191) NULL,
  INDEX `Sessions_expires_idx`(`expires`),
  INDEX `Sessions_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contenttravels` (
  `travel_id` INTEGER NOT NULL,
  `cid` INTEGER NOT NULL,
  INDEX `ContentTravels_travel_id_fkey`(`travel_id`),
  INDEX `ContentTravels_cid_fkey`(`cid`),
  PRIMARY KEY (`travel_id`, `cid`),
  CONSTRAINT `ContentTravels_travel_id_fkey` FOREIGN KEY (`travel_id`) REFERENCES `travels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ContentTravels_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `contents`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 二、站点设置项默认值（informations 表）
-- value 列为字符串，布尔值以 'true' / 'false' 存储，数字以字符串存储。
-- ============================================================

INSERT INTO `informations` (`key`, `value`) VALUES
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
  ('postPageSize', '12'),
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
  ('messagePostId', ''),
  ('linkAutoApprove', 'false'),
  ('searchCacheEnabled', 'false'),
  ('searchCacheExpire', '300')
ON DUPLICATE KEY UPDATE `key` = `key`;

-- ============================================================
-- 三、示例数据
-- 使用显式主键，配合 ON DUPLICATE KEY UPDATE 保证幂等：
-- 重复执行不会新增重复行，也不会覆盖你修改过的内容（含管理员密码）。
-- ============================================================

-- 3.1 默认管理员（admin / 123456 / example@example.com / 默认管理员）
-- 密码为 bcrypt('123456') 的哈希；登录后请尽快修改。
INSERT INTO `users` (`uid`, `name`, `nickname`, `mail`, `password`, `create_time`) VALUES
  (1, 'admin', '默认管理员', 'example@example.com', '$2b$10$hpAJTTHU9sKV0reiQL8FWun.6gR6RDlotAfbCZyGJZbUyozeS6ON6', NOW(3))
ON DUPLICATE KEY UPDATE `uid` = `uid`;

-- 3.2 默认分类
INSERT INTO `metas` (`mid`, `name`, `slug`, `desc`, `type`) VALUES
  (1, '默认分类', 'default', '默认文章分类', 'category')
ON DUPLICATE KEY UPDATE `mid` = `mid`;

-- 3.3 示例文章（type=0 文章，status=1 已发布）
INSERT INTO `contents` (`cid`, `title`, `slug`, `desc`, `content`, `create_time`, `update_time`, `status`, `comment_num`, `type`, `uid`) VALUES
  (1, '你好，世界', 'hello-world', '这是一篇示例文章，用于演示站点的文章展示效果。',
   '# 你好，世界\n\n欢迎使用 **ImQi1 CMS**！这是一篇自动生成的示例文章。\n\n你可以在后台「文章管理」中编辑或删除它，然后开始创作属于你自己的内容。\n\n## Markdown 支持\n\n- 标题、段落、列表\n- **加粗**、*斜体*、`行内代码`\n- 代码块（基于 Shiki 高亮）\n- 图片、链接、引用等\n\n```js\nconsole.log("Hello, ImQi1 CMS!");\n```\n',
   NOW(3), NOW(3), 1, 1, 0, 1)
ON DUPLICATE KEY UPDATE `cid` = `cid`;

-- 3.4 文章 ↔ 分类 关联
INSERT INTO `contentrelations` (`cid`, `mid`) VALUES
  (1, 1)
ON DUPLICATE KEY UPDATE `cid` = `cid`;

-- 3.5 示例评论（status=1 已通过审核，前台可见）
INSERT INTO `comments` (`coid`, `cid`, `name`, `mail`, `content`, `create_time`, `status`) VALUES
  (1, 1, '访客', 'guest@example.com', '这是一条示例评论，欢迎在留言板或文章下方参与讨论！', NOW(3), 1)
ON DUPLICATE KEY UPDATE `coid` = `coid`;
