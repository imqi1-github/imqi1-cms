-- ============================================================
-- 附件表新增 size 列（存储文件字节数，用于列表/详情显示大小）
-- ============================================================
-- 上传时写入；历史记录默认 0，前端对 0 显示为 "-"。
-- 幂等：仅当列不存在时才添加，重复执行无副作用。
-- ============================================================

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attachments'
    AND COLUMN_NAME = 'size'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `attachments` ADD COLUMN `size` INT NOT NULL DEFAULT 0 AFTER `storage`',
  'SELECT "attachments.size 已存在，跳过" AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
