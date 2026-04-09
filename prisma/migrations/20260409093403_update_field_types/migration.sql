/*
  Warnings:

  - You are about to alter the column `ip` on the `comment` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `VarChar(45)`.

*/
-- AlterTable
ALTER TABLE `comment` MODIFY `name` VARCHAR(255) NOT NULL,
    MODIFY `mail` VARCHAR(255) NULL,
    MODIFY `link` VARCHAR(500) NULL,
    MODIFY `avatar` VARCHAR(500) NULL,
    MODIFY `content` TEXT NOT NULL,
    MODIFY `agent` VARCHAR(500) NULL,
    MODIFY `ip` VARCHAR(45) NULL;

-- AlterTable
ALTER TABLE `post` MODIFY `title` VARCHAR(255) NOT NULL,
    MODIFY `slug` VARCHAR(255) NULL,
    MODIFY `desc` TEXT NULL,
    MODIFY `content` LONGTEXT NULL,
    MODIFY `covers` TEXT NULL,
    MODIFY `tags` VARCHAR(500) NULL;
