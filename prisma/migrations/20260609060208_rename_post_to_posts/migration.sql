/*
  Warnings:

  - You are about to drop the `post` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `attachment` DROP FOREIGN KEY `Attachment_cid_fkey`;

-- DropForeignKey
ALTER TABLE `comment` DROP FOREIGN KEY `Comment_cid_fkey`;

-- DropForeignKey
ALTER TABLE `post` DROP FOREIGN KEY `Post_uid_fkey`;

-- DropForeignKey
ALTER TABLE `postrelation` DROP FOREIGN KEY `PostRelation_cid_fkey`;

-- DropTable
DROP TABLE `post`;

-- CreateTable
CREATE TABLE `posts` (
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

    INDEX `Posts_status_type_create_time_idx`(`status`, `type`, `create_time`),
    INDEX `Posts_uid_fkey`(`uid`),
    UNIQUE INDEX `Posts_slug_type_key`(`slug`, `type`),
    PRIMARY KEY (`cid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `attachment` ADD CONSTRAINT `Attachment_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comment` ADD CONSTRAINT `Comment_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posts` ADD CONSTRAINT `Posts_uid_fkey` FOREIGN KEY (`uid`) REFERENCES `user`(`uid`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postrelation` ADD CONSTRAINT `PostRelation_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;
