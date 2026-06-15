-- =====================================================
-- 生产环境数据库初始化脚本
-- 包含所有表结构创建和示例数据插入
--
-- 生成时间: 2026-06-10
-- 数据库: MySQL
-- 字符集: utf8mb4
-- =====================================================

-- 设置字符集和时区
SET NAMES utf8mb4;
SET TIME_ZONE = '+08:00';

-- =====================================================
-- 第一部分：删除已存在的表（如果存在）
-- 注意：按照外键依赖的相反顺序删除
-- =====================================================

DROP TABLE IF EXISTS `subscribeposts`;
DROP TABLE IF EXISTS `subscribes`;
DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `postrelations`;
DROP TABLE IF EXISTS `comments`;
DROP TABLE IF EXISTS `attachments`;
DROP TABLE IF EXISTS `posts`;
DROP TABLE IF EXISTS `changelogs`;
DROP TABLE IF EXISTS `links`;
DROP TABLE IF EXISTS `metas`;
DROP TABLE IF EXISTS `informations`;
DROP TABLE IF EXISTS `users`;

-- =====================================================
-- 第二部分：创建所有数据表
-- 按照外键依赖顺序创建
-- =====================================================

-- 1. 用户表
CREATE TABLE `users` (
  `uid` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(191) NULL,
  `avatar` VARCHAR(191) NULL,
  `mail` VARCHAR(191) NOT NULL,
  `password` VARCHAR(191) NOT NULL,
  `create` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `auth_code` VARCHAR(191) NULL,
  `role` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`uid`),
  UNIQUE INDEX `Users_name_key`(`name`),
  UNIQUE INDEX `Users_mail_key`(`mail`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 系统信息表
CREATE TABLE `informations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(191) NOT NULL,
  `value` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Informations_key_key`(`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 分类/标签表
CREATE TABLE `metas` (
  `mid` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NULL,
  `desc` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'category',
  PRIMARY KEY (`mid`),
  UNIQUE INDEX `Metas_name_key`(`name`),
  UNIQUE INDEX `Metas_slug_key`(`slug`),
  INDEX `Metas_mid_type_idx`(`mid`, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 文章表
CREATE TABLE `posts` (
  `cid` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NULL,
  `desc` TEXT NULL,
  `content` LONGTEXT NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `update_time` DATETIME(3) NOT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `comment_num` INT NOT NULL DEFAULT 0,
  `many_covers` BOOLEAN NOT NULL DEFAULT false,
  `covers` TEXT NULL,
  `show_toc` BOOLEAN NOT NULL DEFAULT false,
  `tags` VARCHAR(500) NULL,
  `type` INT NOT NULL DEFAULT 0,
  `uid` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (`cid`),
  UNIQUE INDEX `Posts_slug_type_key`(`slug`, `type`),
  INDEX `Posts_status_type_create_time_idx`(`status`, `type`, `create_time`),
  INDEX `Posts_uid_fkey`(`uid`),
  CONSTRAINT `Posts_uid_fkey` FOREIGN KEY (`uid`) REFERENCES `users`(`uid`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 文章-分类/标签关联表
CREATE TABLE `postrelations` (
  `cid` INT NOT NULL,
  `mid` INT NOT NULL,
  PRIMARY KEY (`mid`, `cid`),
  INDEX `PostRelation_mid_cid_idx`(`mid`, `cid`),
  INDEX `PostRelation_cid_fkey`(`cid`),
  CONSTRAINT `PostRelation_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PostRelation_mid_fkey` FOREIGN KEY (`mid`) REFERENCES `metas`(`mid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. 评论表
CREATE TABLE `comments` (
  `coid` INT NOT NULL AUTO_INCREMENT,
  `cid` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `mail` VARCHAR(255) NULL,
  `link` VARCHAR(500) NULL,
  `content` TEXT NOT NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` INT NOT NULL DEFAULT 0,
  `parent_id` INT NULL,
  `agent` VARCHAR(500) NULL,
  `ip` VARCHAR(45) NULL,
  PRIMARY KEY (`coid`),
  INDEX `Comments_cid_fkey`(`cid`),
  CONSTRAINT `Comments_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. 附件表
CREATE TABLE `attachments` (
  `aid` INT NOT NULL AUTO_INCREMENT,
  `cid` INT NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `url` VARCHAR(191) NOT NULL,
  `storage` VARCHAR(191) NOT NULL DEFAULT 'local',
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`aid`),
  INDEX `Attachment_cid_fkey`(`cid`),
  CONSTRAINT `Attachment_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. 更新日志表
CREATE TABLE `changelogs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `class` VARCHAR(191) NOT NULL,
  `desc` TEXT NOT NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Changelogs_create_time_idx`(`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. 友链表
CREATE TABLE `links` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `desc` VARCHAR(191) NULL,
  `link` VARCHAR(191) NOT NULL,
  `avatar` VARCHAR(191) NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `originalLinkId` INT NULL,
  `isModification` BOOLEAN NOT NULL DEFAULT false,
  `modificationStatus` VARCHAR(191) NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  CONSTRAINT `links_originalLinkId_fkey` FOREIGN KEY (`originalLinkId`) REFERENCES `links`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. 会话表
CREATE TABLE `sessions` (
  `id` VARCHAR(191) NOT NULL,
  `userId` INT NOT NULL,
  `authCode` VARCHAR(191) NOT NULL,
  `expires` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `data` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  INDEX `Sessions_expires_idx`(`expires`),
  INDEX `Sessions_userId_idx`(`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. 订阅源表
CREATE TABLE `subscribes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `url` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `avatar` VARCHAR(191) NULL,
  `lastUpdated` DATETIME(3) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. 订阅文章表
CREATE TABLE `subscribeposts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `subscribeId` INT NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `link` VARCHAR(500) NOT NULL,
  `description` TEXT NULL,
  `content` LONGTEXT NULL,
  `author` VARCHAR(255) NULL,
  `pubDate` DATETIME(3) NULL,
  `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SubscribePost_link_key`(`link`),
  INDEX `SubscribePost_subscribeId_fkey`(`subscribeId`),
  CONSTRAINT `SubscribePost_subscribeId_fkey` FOREIGN KEY (`subscribeId`) REFERENCES `subscribes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 第三部分：插入示例数据
-- 按照外键依赖顺序插入
-- =====================================================

-- 插入管理员用户
-- 默认密码：admin123 (使用 bcryptjs 生成，salt rounds = 10)
INSERT INTO `users` (`name`, `nickname`, `mail`, `password`, `role`)
VALUES ('admin', '管理员', 'admin@example.com', '$2a$10$vtD5ulRH6k9Lt0iLcoa66.9A9nqqo1wPgdxab2v0nCuim/eaZGidu', 1);

-- 插入系统配置信息
INSERT INTO `informations` (`key`, `value`) VALUES
('siteName', 'ImQi1 博客'),
('siteDescription', '做技术的分享者、生活的摄影师、时事的评论员'),
('commentEnabled', '1'),
('messagePostId', '0');

-- 插入分类
INSERT INTO `metas` (`name`, `slug`, `desc`, `type`)
VALUES ('技术分享', 'tech', '技术相关文章', 'category');

-- 插入示例文章
-- 使用当前时间作为创建和更新时间
SET @now = NOW(6);

INSERT INTO `posts` (
  `title`,
  `slug`,
  `desc`,
  `content`,
  `create_time`,
  `update_time`,
  `status`,
  `comment_num`,
  `show_toc`,
  `type`,
  `uid`
) VALUES (
  '欢迎使用 ImQi1 博客系统',
  'welcome-to-imqi1-blog',
  '这是一篇示例文章，介绍了博客系统的基本功能和特点。',
  '欢迎使用 ImQi1 博客系统！

这是一篇自动生成的示例文章，用于展示博客系统的基本功能。

## 关于本系统

ImQi1 博客是一个基于现代 Web 技术构建的博客系统，具有以下特点：

- 🚀 **高性能**：采用 Nuxt 3 构建，支持 SSR 和 ISR
- 🎨 **美观界面**：现代化的设计，支持深色模式
- 💬 **评论功能**：支持访客评论和回复
- 🏷️ **分类标签**：文章分类和标签管理
- 📝 **友好链接**：友情链接管理功能

## 开始使用

1. 登录后台管理界面
2. 修改管理员密码
3. 创建您的第一篇文章
4. 开始您的博客之旅！

祝您使用愉快！',
  @now,
  @now,
  1,    -- status: 已发布
  1,    -- comment_num: 1条评论
  TRUE, -- show_toc: 显示目录
  0,    -- type: 普通文章
  1     -- uid: 管理员用户ID
);

-- 获取刚插入的文章 ID
SET @post_cid = LAST_INSERT_ID();

-- 将文章与分类关联
INSERT INTO `postrelations` (`cid`, `mid`)
SELECT @post_cid, `mid` FROM `metas` WHERE `slug` = 'tech';

-- 插入示例评论
INSERT INTO `comments` (
  `cid`,
  `name`,
  `mail`,
  `link`,
  `content`,
  `status`,
  `create_time`,
  `ip`
) VALUES (
  @post_cid,
  '访客',
  'visitor@example.com',
  'https://example.com',
  '这是一条示例评论。恭喜您成功安装了 ImQi1 博客系统！',
  1,    -- status: 已审核
  @now,
  '127.0.0.1'
);

-- 插入一条更新日志
INSERT INTO `changelogs` (`class`, `desc`, `create_time`)
VALUES ('新增', '初始化博客系统，安装完成', @now);

-- =====================================================
-- 第四部分：验证数据
-- =====================================================

-- 显示插入的示例数据
SELECT '========================================' AS '';
SELECT '数据库初始化完成！' AS '状态';
SELECT '========================================' AS '';
SELECT '示例数据统计：' AS '';

SELECT
  CONCAT('用户数: ', COUNT(*)) AS '统计信息'
FROM `users`
UNION ALL
SELECT
  CONCAT('文章数: ', COUNT(*))
FROM `posts`
UNION ALL
SELECT
  CONCAT('分类数: ', COUNT(*))
FROM `metas`
WHERE `type` = 'category'
UNION ALL
SELECT
  CONCAT('评论数: ', COUNT(*))
FROM `comments`;

SELECT '========================================' AS '';
SELECT '默认管理员账号：' AS '';
SELECT '用户名: admin' AS '';
SELECT '密码: admin123 (请及时修改)' AS '';
SELECT '========================================' AS '';
