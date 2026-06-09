/*
  Warnings:

  - You are about to drop the `subscribepost` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `subscribepost` DROP FOREIGN KEY `SubscribePost_subscribeId_fkey`;

-- DropTable
DROP TABLE `subscribepost`;

-- CreateTable
CREATE TABLE `subscribeposts` (
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

-- AddForeignKey
ALTER TABLE `subscribeposts` ADD CONSTRAINT `SubscribePost_subscribeId_fkey` FOREIGN KEY (`subscribeId`) REFERENCES `subscribes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
