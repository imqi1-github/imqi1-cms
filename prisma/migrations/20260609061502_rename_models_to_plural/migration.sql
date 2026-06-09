/*
  Warnings:

  - You are about to drop the `subscribe` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `subscribepost` DROP FOREIGN KEY `SubscribePost_subscribeId_fkey`;

-- DropTable
DROP TABLE `subscribe`;

-- CreateTable
CREATE TABLE `subscribes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NULL,
    `lastUpdated` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `subscribepost` ADD CONSTRAINT `SubscribePost_subscribeId_fkey` FOREIGN KEY (`subscribeId`) REFERENCES `subscribes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
