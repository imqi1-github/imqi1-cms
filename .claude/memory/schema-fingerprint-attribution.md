---
name: schema-fingerprint-attribution
description: prisma/schema.prisma 首行是 SHA-256 前缀的归属指纹；结构性改动必须刷新，否则 fork 后改名的归属证据失效
metadata:
  type: project
---

`prisma/schema.prisma` 首行（generator 块之前）固定一行注释：`// schema-fingerprint: 8831164081fcb4bc`（SHA-256 前 16 字符）。**改动 schema（增删字段、改类型、改索引、改 `map:`、改 model/字段名）必须同步刷新这个哈希。**

**Why:** 防「fork 后删 LICENSE / 改字符串 / 重命名变量却仍保留 DB schema」这种归属被洗掉的情况；与 AGPL v3 §13（网络服务须公开源码）的法律杠杆配合。

**刷新算法**（手算或临时一次性脚本，未保留工具）：
1. 读 schema.prisma；2. 剥掉所有 `//` 与 `/* */` 注释；3. 删 `generator {}` / `datasource {}` 块；
4. 按 `{}` 深度配对提取每个 `model X { ... }` 体，体内逐行解析字段（`name type modifiers`，合并空白）与块级 `@@index` / `@@unique` / `@@id`；
5. model 按名 `localeCompare` 排序，model 内字段与块级属性各自排序；
6. `JSON.stringify(models)` → `createHash('sha256').update(...).digest('hex').slice(0, 16)`。

注释、空白、默认值字符串变化不影响哈希（会被规范化）。

**刻意不保留 `scripts/schema-fingerprint.ts`**：刷新频率极低（仅结构性改动），临时写一次性脚本更轻。

相关：[[prisma-relation-key-rename-trap]]
