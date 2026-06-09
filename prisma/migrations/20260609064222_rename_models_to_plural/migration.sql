/*
  Warnings:

  - You are about to drop the `attachment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `attachment` DROP FOREIGN KEY `Attachment_cid_fkey`;

-- DropTable
DROP TABLE `attachment`;

-- CreateTable
CREATE TABLE `attachments` (
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

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `Attachment_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;
