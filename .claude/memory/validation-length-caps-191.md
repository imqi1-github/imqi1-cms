---
name: validation-length-caps-191
description: Prisma MySQL 默认 String=VARCHAR(191),validateXxxData 长度上限须 ≤ 列长,否则过校验仍写库 500
metadata:
  node_type: memory
  type: project
---

Prisma MySQL 的裸 `String` 默认是 **VARCHAR(191)**(不是 255)。`server/utils/validation.ts` 曾把多处上限写成 255/500(代码注释还误写「MySQL 默认 VARCHAR 255」),对 metas/links/users/subscribes/informations.value 等裸 String 列,超过 191 会「过校验 → 写库时 DB 溢出 → 500」,而非友好的 400。

**Why:** 校验层上限只防应用层、不换列类型;裸 String 列实际容量是 191,校验上限超过它,校验形同虚设,最终被 Prisma 打挂成 500。

**How to apply:** 加/改校验器先查 `prisma/schema.prisma` 对应字段的实际列长:裸 `String`=191;显式 `@db.VarChar(255/500)`、`@db.Text` 才按其值定上限。把 validateXxxData 每处上限降到 ≤ 列长(2026-08-25 批3 已把 validation.ts 里所有 255/500 降到 191)。改 schema 列本身是另一回事(那是真「改列长」,走 db execute 幂等脚本,禁 migrate)。关联 [[db-migration-disconnected]]。
