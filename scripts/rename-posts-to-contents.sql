-- ============================================================================
-- 迁移：posts → contents 主表 + 关联表彻底重命名
--   posts            → contents
--   postrelations    → contentrelations
--   postattachments  → contentattachments
--   posttravels      → contenttravels
--   subscribeposts   保持不变（RSS 外部订阅，语义独立）
--
-- 同时把外键 / 索引名从 Post*/PostRelation*/PostAttachments*/PostTravels*
-- （生产库实际为 Post_/Comment_ 单数前缀）统一为 Content* 前缀，
-- 与 prisma/schema.prisma 的 map: 声明一致。
--
-- 幂等：全程用 information_schema 判断当前状态，可安全重复执行。
-- 依赖：MySQL 8.x（RENAME TABLE / ALTER TABLE RENAME INDEX / DROP+ADD FK）。
-- 执行方式：mysql < 本文件，或 bun run scripts/rename-posts-to-contents.ts
-- 建议执行前对生产库做一次备份。
-- ============================================================================

SET @db := DATABASE();

-- ---------------------------------------------------------------------------
-- 0) 先临时关闭外键检查，避免重命名过程中的引用中断
-- ---------------------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1) 重命名表（仅当旧表存在且新表不存在时执行）
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS __rename_table;
DELIMITER //
CREATE PROCEDURE __rename_table(IN old_name VARCHAR(64), IN new_name VARCHAR(64))
BEGIN
  DECLARE has_old INT DEFAULT 0;
  DECLARE has_new INT DEFAULT 0;
  SELECT COUNT(*) INTO has_old FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = old_name;
  SELECT COUNT(*) INTO has_new FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = new_name;
  IF has_old = 1 AND has_new = 0 THEN
    SET @sql := CONCAT('RENAME TABLE `', old_name, '` TO `', new_name, '`');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL __rename_table('posts', 'contents');
CALL __rename_table('postrelations', 'contentrelations');
CALL __rename_table('postattachments', 'contentattachments');
CALL __rename_table('posttravels', 'contenttravels');
DROP PROCEDURE __rename_table;

-- ---------------------------------------------------------------------------
-- 2) 重命名外键约束（DROP + ADD；仅当旧约束存在且新约束不存在时执行）
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS __rename_fk;
DELIMITER //
CREATE PROCEDURE __rename_fk(
  IN tbl VARCHAR(64), IN old_fk VARCHAR(64), IN new_fk VARCHAR(64),
  IN col VARCHAR(64), IN ref_tbl VARCHAR(64), IN ref_col VARCHAR(64),
  IN on_delete VARCHAR(16)
)
BEGIN
  DECLARE has_old INT DEFAULT 0;
  DECLARE has_new INT DEFAULT 0;
  SELECT COUNT(*) INTO has_old FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl
      AND CONSTRAINT_NAME = old_fk AND CONSTRAINT_TYPE = 'FOREIGN KEY';
  SELECT COUNT(*) INTO has_new FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl
      AND CONSTRAINT_NAME = new_fk AND CONSTRAINT_TYPE = 'FOREIGN KEY';
  IF has_old = 1 AND has_new = 0 THEN
    SET @sql := CONCAT('ALTER TABLE `', tbl, '` DROP FOREIGN KEY `', old_fk, '`');
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
    SET @sql := CONCAT('ALTER TABLE `', tbl, '` ADD CONSTRAINT `', new_fk,
      '` FOREIGN KEY (`', col, '`) REFERENCES `', ref_tbl, '`(`', ref_col,
      '`) ON DELETE ', on_delete, ' ON UPDATE CASCADE');
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
DELIMITER ;

-- comments.cid → contents.cid  (生产库旧名 Comment_cid_fkey)
CALL __rename_fk('comments', 'Comment_cid_fkey',  'Comments_cid_fkey', 'cid', 'contents', 'cid', 'CASCADE');
CALL __rename_fk('comments', 'Comments_cid_fkey', 'Comments_cid_fkey', 'cid', 'contents', 'cid', 'CASCADE');

-- contents.uid → users.uid  (生产库旧名 Post_uid_fkey)
CALL __rename_fk('contents', 'Post_uid_fkey',  'Contents_uid_fkey', 'uid', 'users', 'uid', 'RESTRICT');
CALL __rename_fk('contents', 'Posts_uid_fkey', 'Contents_uid_fkey', 'uid', 'users', 'uid', 'RESTRICT');

-- contentrelations
CALL __rename_fk('contentrelations', 'PostRelation_cid_fkey', 'ContentRelation_cid_fkey', 'cid', 'contents', 'cid', 'CASCADE');
CALL __rename_fk('contentrelations', 'PostRelation_mid_fkey', 'ContentRelation_mid_fkey', 'mid', 'metas',    'mid', 'CASCADE');

-- contentattachments
CALL __rename_fk('contentattachments', 'PostAttachments_aid_fkey', 'ContentAttachments_aid_fkey', 'aid', 'attachments', 'aid', 'CASCADE');
CALL __rename_fk('contentattachments', 'PostAttachments_cid_fkey', 'ContentAttachments_cid_fkey', 'cid', 'contents',    'cid', 'CASCADE');

-- contenttravels
CALL __rename_fk('contenttravels', 'PostTravels_travel_id_fkey', 'ContentTravels_travel_id_fkey', 'travel_id', 'travels',  'id',  'CASCADE');
CALL __rename_fk('contenttravels', 'PostTravels_cid_fkey',       'ContentTravels_cid_fkey',       'cid',       'contents', 'cid', 'CASCADE');

DROP PROCEDURE __rename_fk;

-- ---------------------------------------------------------------------------
-- 3) 重命名普通/唯一索引（仅当旧索引存在且新索引不存在时执行）
--    注：DROP+ADD FK 会自动带出/重建同名附属索引，这里只处理其余索引。
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS __rename_index;
DELIMITER //
CREATE PROCEDURE __rename_index(IN tbl VARCHAR(64), IN old_idx VARCHAR(64), IN new_idx VARCHAR(64))
BEGIN
  DECLARE has_old INT DEFAULT 0;
  DECLARE has_new INT DEFAULT 0;
  SELECT COUNT(*) INTO has_old FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = old_idx;
  SELECT COUNT(*) INTO has_new FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = new_idx;
  IF has_old > 0 AND has_new = 0 THEN
    SET @sql := CONCAT('ALTER TABLE `', tbl, '` RENAME INDEX `', old_idx, '` TO `', new_idx, '`');
    PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
DELIMITER ;

-- contents 表索引（生产库旧名单数 Post_*）
CALL __rename_index('contents', 'Post_slug_type_key',              'Contents_slug_type_key');
CALL __rename_index('contents', 'Posts_slug_type_key',             'Contents_slug_type_key');
CALL __rename_index('contents', 'Post_status_type_create_time_idx',  'Contents_status_type_create_time_idx');
CALL __rename_index('contents', 'Posts_status_type_create_time_idx', 'Contents_status_type_create_time_idx');
CALL __rename_index('contents', 'Post_uid_fkey',   'Contents_uid_fkey');
CALL __rename_index('contents', 'Posts_uid_fkey',  'Contents_uid_fkey');

-- comments 索引
CALL __rename_index('comments', 'Comment_cid_fkey',  'Comments_cid_fkey');

-- contentrelations 索引
CALL __rename_index('contentrelations', 'PostRelation_mid_cid_idx', 'ContentRelation_mid_cid_idx');
CALL __rename_index('contentrelations', 'PostRelation_cid_fkey',    'ContentRelation_cid_fkey');
CALL __rename_index('contentrelations', 'PostRelation_mid_fkey',    'ContentRelation_mid_fkey');

-- contentattachments 索引
CALL __rename_index('contentattachments', 'PostAttachments_aid_fkey', 'ContentAttachments_aid_fkey');
CALL __rename_index('contentattachments', 'PostAttachments_cid_fkey', 'ContentAttachments_cid_fkey');

-- contenttravels 索引
CALL __rename_index('contenttravels', 'PostTravels_travel_id_fkey', 'ContentTravels_travel_id_fkey');
CALL __rename_index('contenttravels', 'PostTravels_cid_fkey',       'ContentTravels_cid_fkey');

DROP PROCEDURE __rename_index;

SET FOREIGN_KEY_CHECKS = 1;
