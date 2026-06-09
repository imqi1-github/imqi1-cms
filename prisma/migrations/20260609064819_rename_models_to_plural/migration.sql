/*
  Warnings:

  - You are about to drop the `postrelation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `postrelation` DROP FOREIGN KEY `PostRelation_cid_fkey`;

-- DropForeignKey
ALTER TABLE `postrelation` DROP FOREIGN KEY `PostRelation_mid_fkey`;

-- DropTable
DROP TABLE `postrelation`;

-- CreateTable
CREATE TABLE `postrelations` (
    `cid` INTEGER NOT NULL,
    `mid` INTEGER NOT NULL,

    INDEX `PostRelation_mid_cid_idx`(`mid`, `cid`),
    INDEX `PostRelation_cid_fkey`(`cid`),
    PRIMARY KEY (`cid`, `mid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `postrelations` ADD CONSTRAINT `PostRelation_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postrelations` ADD CONSTRAINT `PostRelation_mid_fkey` FOREIGN KEY (`mid`) REFERENCES `metas`(`mid`) ON DELETE CASCADE ON UPDATE CASCADE;
