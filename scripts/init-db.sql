-- ============================================================
-- 初始化管理员账户（生产环境直接在 SQL 管理工具执行）
-- ============================================================
-- 默认账户：
--   用户名: admin
--   邮箱:   admin@example.com
--   密码:   admin123456
--
-- 单用户系统：唯一用户即最高权限，无角色字段。
--
-- ⚠️  登录后请立即在后台「账户设置」修改密码；
--     如需自定义用户名/邮箱/密码，请修改下方对应字段，
--     或改用开发环境脚本：bun run reset:password
--
-- 幂等：name 与 mail 均有唯一约束，重复执行会触发 ON DUPLICATE KEY UPDATE
--       （不会新增第二条记录，password 也不会被覆盖，避免误改）。
-- ============================================================

INSERT INTO `users` (`name`, `nickname`, `mail`, `password`, `create_time`)
VALUES (
  'admin',
  '管理员',
  'admin@example.com',
  '$2a$10$71liP.Wx/EF9iWt/aJNcluudizcB6L.Q1b0ZRu1rDYxhgJzXTijkC',
  NOW(3)
)
ON DUPLICATE KEY UPDATE `uid` = `uid`;
