/*
  Warnings:

  - You are about to drop the `meta` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `postrelation` DROP FOREIGN KEY `PostRelation_mid_fkey`;

-- DropIndex
DROP INDEX `PostRelation_mid_fkey` ON `postrelation`;

-- DropTable
DROP TABLE `meta`;

-- CreateTable
CREATE TABLE `metas` (
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

-- AddForeignKey
ALTER TABLE `postrelation` ADD CONSTRAINT `PostRelation_mid_fkey` FOREIGN KEY (`mid`) REFERENCES `metas`(`mid`) ON DELETE CASCADE ON UPDATE CASCADE;
