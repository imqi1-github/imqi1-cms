-- ============================================================
-- 单用户化：删除 users.role 列
-- ============================================================
-- 单用户系统下角色无意义（唯一用户即最高权限），移除该列。
-- 幂等：仅当列存在时才删除，重复执行无副作用。
-- ============================================================

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'role'
);

SET @sql = IF(@col_exists = 1,
  'ALTER TABLE `users` DROP COLUMN `role`',
  'SELECT "users.role 已不存在，跳过" AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
