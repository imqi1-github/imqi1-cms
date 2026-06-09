/*
  Warnings:

  - You are about to drop the `link` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `link` DROP FOREIGN KEY `link_originalLinkId_fkey`;

-- DropTable
DROP TABLE `link`;

-- CreateTable
CREATE TABLE `links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `desc` VARCHAR(191) NULL,
    `link` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `originalLinkId` INTEGER NULL,
    `isModification` BOOLEAN NOT NULL DEFAULT false,
    `modificationStatus` VARCHAR(191) NULL DEFAULT 'pending',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `links` ADD CONSTRAINT `links_originalLinkId_fkey` FOREIGN KEY (`originalLinkId`) REFERENCES `links`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
