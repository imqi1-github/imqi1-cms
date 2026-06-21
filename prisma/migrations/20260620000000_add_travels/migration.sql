-- CreateTable
CREATE TABLE `travels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `desc` TEXT NULL,
    `cover` VARCHAR(500) NULL,
    `cid` INTEGER NULL,
    `longitude` DOUBLE NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Travels_cid_fkey`(`cid`),
    INDEX `Travels_sort_idx`(`sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `travels` ADD CONSTRAINT `Travels_cid_fkey` FOREIGN KEY (`cid`) REFERENCES `posts`(`cid`) ON DELETE CASCADE ON UPDATE CASCADE;
