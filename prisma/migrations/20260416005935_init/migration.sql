-- CreateTable
CREATE TABLE `attachment` (
    `aid` INTEGER NOT NULL AUTO_INCREMENT,
    `cid` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `storage` VARCHAR(191) NOT NULL DEFAULT 'local',
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Attachment_cid_fkey`(`cid`),
    PRIMARY KEY (`aid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meta` (
    `mid` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NULL,
    `desc` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'category',

    UNIQUE INDEX `Meta_name_key`(`name`),
    UNIQUE INDEX `Meta_slug_key`(`slug`),
    INDEX `Meta_mid_type_idx`(`mid`, `type`),
    PRIMARY KEY (`mid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `changelog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class` VARCHAR(191) NOT NULL,
    `desc` TEXT NOT NULL,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comment` (
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

    INDEX `Comment_cid_fkey`(`cid`),
    PRIMARY KEY (`coid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `link` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `desc` VARCHAR(191) NULL,
    `link` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `information` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Information_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `post` (
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

    INDEX `Post_status_type_create_time_idx`(`status`, `type`, `create_time`),
    INDEX `Post_uid_fkey`(`uid`),
    UNIQUE INDEX `Post_slug_type_key`(`slug`, `type`),
    PRIMARY KEY (`cid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `postrelation` (
    `cid` INTEGER NOT NULL,
    `mid` INTEGER NOT NULL,

    INDEX `PostRelation_mid_fkey`(`mid`),
    PRIMARY KEY (`cid`, `mid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `authCode` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `data` VARCHAR(191) NULL,

    INDEX `Session_expires_idx`(`expires`),
    INDEX `Session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscribe` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NULL,
    `lastUpdated` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscribepost` (
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
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `uid` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NULL,
    `avatar` VARCHAR(191) NULL,
    `mail` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `create` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `auth_code` VARCHAR(191) NULL,
    `role` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `User_name_key`(`name`),
    UNIQUE INDEX `User_mail_key`(`mail`),
    PRIMARY KEY (`uid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attachment` ADD CONSTRAINT `Attachment_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `post`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comment` ADD CONSTRAINT `Comment_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `post`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `post` ADD CONSTRAINT `Post_uid_fkey` FOREIGN KEY (`uid`) REFERENCES `user`(`uid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postrelation` ADD CONSTRAINT `PostRelation_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `post`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postrelation` ADD CONSTRAINT `PostRelation_mid_fkey` FOREIGN KEY (`mid`) REFERENCES `meta`(`mid`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscribepost` ADD CONSTRAINT `SubscribePost_subscribeId_fkey` FOREIGN KEY (`subscribeId`) REFERENCES `subscribe`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
