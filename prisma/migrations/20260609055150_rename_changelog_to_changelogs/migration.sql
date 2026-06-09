/*
  Warnings:

  - You are about to drop the `changelog` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE `link` ADD COLUMN `isModification` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `modificationStatus` VARCHAR(191) NULL DEFAULT 'pending',
    ADD COLUMN `originalLinkId` INTEGER NULL;

-- DropTable
DROP TABLE `changelog`;

-- CreateTable
CREATE TABLE `changelogs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `class` VARCHAR(191) NOT NULL,
    `desc` TEXT NOT NULL,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Changelogs_create_time_idx`(`create_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `PostRelation_mid_cid_idx` ON `postrelation`(`mid`, `cid`);

-- CreateIndex
CREATE INDEX `PostRelation_cid_fkey` ON `postrelation`(`cid`);

-- AddForeignKey
ALTER TABLE `link` ADD CONSTRAINT `link_originalLinkId_fkey` FOREIGN KEY (`originalLinkId`) REFERENCES `link`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
