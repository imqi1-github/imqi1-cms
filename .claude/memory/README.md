# 项目记忆（.claude/memory）

这里是 Claude Code 关于本项目的踩坑/约定记忆，**git 跟踪、随仓库分享**。

## 结构
- 每个 `.md` = 一条记忆（见索引 `MEMORY.md` 的 one-line hook）
- `MEMORY.md` = 索引，每会话加载

## ⚠️ 双份关系（重要）
Claude Code 的 auto-memory 每会话自动加载**用户级镜像**，其目录由项目路径自动派生（`~/.claude/projects/<路径派生ID>/memory/`），**随机器/路径不同——勿写死具体 ID**。

- **本项目 `.claude/memory/` = 权威/存储**（进 git、可分享、跨机一致）
- **用户级那份 = 自动加载的镜像**（harness 只从那里读）

改动某条记忆时**两边同步写**（本项目先写，再把 `.claude/memory/*.md` 复制到本机对应的用户级路径）。只改一边会导致：仓库里有、但本会话自动记忆不更新，或反之。

## 约定
- 类型：`user` / `feedback` / `project` / `reference`
- 每条一个重点（修 bug 留的坑、团队规范、外部资源指针）
- 别记仓库本身已记录的东西（代码结构、git 历史、CLAUDE.md）
