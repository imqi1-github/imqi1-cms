# MCP 运维工具组（MCP_OPS_TOKEN 门禁）

2026-10-06 给 `/mcp`（生产公开端点）加了 5 个运维工具：`get_system_status` / `get_recent_logs` / `get_content_stats` / `get_cache_info` / `clear_cache`，全部在 `server/utils/mcp-tools.ts` 的 `registerOpsTools()`。

**Why:** 站主想让 AI agent 通过 MCP 直接排查线上问题（日志/缓存/DB 状态），但 `/mcp` 是无鉴权公开端点，日志和系统信息含 IP 等敏感数据，绝不能裸暴露。

**How to apply:**
- 门禁 = 运行环境变量 `MCP_OPS_TOKEN`（.env.example 有说明，compose 经 `env_file: ../.env` 自动进容器）。**未配置时运维工具整个不注册（fail-closed，同 mini-auth 策略）**；配置后每个工具入参必须带 `token`，`verifyOpsToken()` 用 timingSafeEqual 定长比较。token 每请求从 `process.env` 现读，生产补配无需重新构建。
- `clear_cache` 是全部 20 个工具里**唯一非 readOnly**（`destructiveHint: true` + 入参 `confirm: true` 双确认）；清的是缓存、自动重建，属安全可逆，其余运维工具全 `readOnlyHint: true`。缓存清理复用 `content-cache.ts` 的 `scanAndUnlink`（已导出）与 `invalidateContentCaches()`（pages target，`cleared:-1` 表示全组，与 admin 端语义一致）；`countKeysByPattern` 是同文件新增的只计数 SCAN。
- `get_recent_logs` 类别白名单直接取 `LOG_TAG_LABELS` 的键（与 log.ts 落盘子目录同名），date 入参正则 `^\d{4}-\d{2}-\d{2}$`——两道防线防路径穿越；每行 4000 字符截断 + 总量 256KB 兜底防撑爆模型上下文。log.ts 的 `dateKey` 为此导出。
- `get_cache_info` 统计的键前缀是**真实 Redis 键**：`nitro:routes:`（ISR 整页缓存，冒号分隔见 [[nitro-route-cache-key-colon]]）、`search:`、`custom:`、`error:notify:`、`rl:mcp:post:`——**`rl:` 是 rate-limit.ts 内部加的前缀**（key 传 `mcp:post:${ip}`，实际键是 `rl:mcp:post:...`），别按传入 key 原样猜。
- 单测 `test/unit/server/utils/mcp-tools.test.ts`：mock 了 `#server/utils/redis`（handler-map 假 redis，仿 fake-prisma 模式）；**`process.env.LOGS_DIR` 必须在 `await import("#server/utils/mcp-tools")` 之前设**（log.ts 的 `LOGS_DIR_RESOLVED` 模块加载时解析），指到 tmpdir 写确定性日志文件；注册契约断言「未配 token 15 个 / 配了 20 个」。
