/*
  Warnings:

  - You are about to drop the `comment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `comment` DROP FOREIGN KEY `Comment_cid_fkey`;

-- DropTable
DROP TABLE `comment`;

-- CreateTable
CREATE TABLE `comments` (
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

    INDEX `Comments_cid_fkey`(`cid`),
    PRIMARY KEY (`coid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `Comments_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;
