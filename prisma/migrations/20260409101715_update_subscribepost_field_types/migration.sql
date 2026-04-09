-- AlterTable
ALTER TABLE `subscribepost` MODIFY `title` VARCHAR(500) NOT NULL,
    MODIFY `link` VARCHAR(500) NOT NULL,
    MODIFY `description` TEXT NULL,
    MODIFY `content` LONGTEXT NULL,
    MODIFY `author` VARCHAR(255) NULL;
